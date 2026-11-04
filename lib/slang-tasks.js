import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWrite } from "./state-file.js";
import { slangState, slangSources, sourceKey, sourceText, learnSlang, updateSlang, updateSlangBatch, researchSources, applySlangResearch, applySlangExplanation, slangResearchFailure, searchSlang } from "./slang.js";

// Own lane and durable store: never reload or save the forum worker's snapshot.
export class SlangTasks {
  constructor(owner) {
    this.owner=owner;
    this.directory=owner.directory;
    this.file=path.join(this.directory,"slang.json");
    this.lockFile=path.join(this.directory,"slang.lock");
    this.revision=0;
    this.data={accounts:{},config:owner.data.config};
    this.pending=new Map();
    this.fault="";
    let unlockMain,unlock;
    try {
      if(owner.fault)throw new Error(owner.fault);
      unlockMain=owner.lock();unlock=this.lock();
      if(fs.existsSync(this.file)) this.reload();
      else {
        const legacy=fs.existsSync(owner.file) ? JSON.parse(fs.readFileSync(owner.file,"utf8")) : owner.data;
        for(const [id,a] of Object.entries(legacy.accounts)) {
          if(a.slang) {const {contexts,...state}=structuredClone(slangState(a));this.data.accounts[id]={slang:state};}
        }
        this.save();
      }
      this.migrated=true;
    } catch {this.fault="黑话状态读取失败，请检查 slang.json 和任务锁；刷帖任务不受影响";}
    finally {unlock?.();unlockMain?.();}
  }
  get closed(){return this.owner.closed;}
  account(){return this.owner.account();}
  now(){return this.owner.now();}
  generate(...args){return this.owner.generate(...args);}
  get search(){return this.owner.search;}
  lock(){return this.owner.lock(this.lockFile);}
  status(){return this.owner.status();}
  log(type,message){this.slangTask && (this.slangTask.pausedReason=message);}
  reload(){
    const stored=JSON.parse(fs.readFileSync(this.file,"utf8"));
    if(!stored.accounts || typeof stored.accounts!=="object" || Array.isArray(stored.accounts))throw new Error("invalid slang state");
    for(const a of Object.values(stored.accounts)){
      if(!a?.slang || !Array.isArray(a.slang.entries) || !Array.isArray(a.slang.sources))throw new Error("invalid glossary account");
      slangState(a);
    }
    this.data={...stored,config:structuredClone(this.owner.data.config)};
  }
  save(){
    const accounts=Object.fromEntries(Object.entries(this.data.accounts).map(([id,a])=>{
      const {contexts,...state}=slangState(a);return [id,{slang:state}];
    }));
    try{atomicWrite(this.file,{accounts});}catch(error){error.persistence=true;throw error;}
  }
  accountState(account){return this.data.accounts[account.id] ||= {};}
  state(account){return slangState(this.accountState(account));}
  contexts(account){return this.owner.data.accounts[account.id]?.slang?.contexts || [];}
  cancel(){this.revision++;this.pending.clear();this.controller?.abort();}
  enqueue(account,input,postId){
    if(this.closed || this.fault || !this.owner.data.config.slangLearning || !sourceText(input).trim())return;
    const key=account.id+":"+sourceKey(input);
    if(this.state(account).sources.includes(sourceKey(input)))return;
    this.pending.set(key,{account:{...account},input,postId});
    // Match the retained context bound. No unbounded backlog while explanations run.
    while(this.pending.size>10)this.pending.delete(this.pending.keys().next().value);
    this.drain();
  }
  drain(){
    if(this.running || this.closed || this.fault || !this.pending.size)return;
    if(!this.owner.data.config.slangLearning){this.pending.clear();return;}
    const [key,job]=this.pending.entries().next().value;this.pending.delete(key);
    if(this.account()?.id!==job.account.id || this.account()?.identity!==job.account.identity){queueMicrotask(()=>this.drain());return;}
    try{this.runSlang({action:"extract",accountId:job.account.id},[job]);}
    catch{this.log("error","后台找词暂未完成，可稍后手动重试");queueMicrotask(()=>this.drain());}
  }
  editSlang(payload) {
    if (this.fault) throw new Error(this.fault);
    if (this.running) throw new Error("任务运行中，请先停止，待任务结束后修改黑话");
    const account = this.account();
    if (!account?.id) throw new Error("请先登录小黑盒");
    if (payload.accountId !== account.id) throw new Error("账号已切换，请刷新词库后重试");
    const unlock = this.lock();
    try {
      this.reload();
      const state = slangState(this.accountState(account));
      if (payload.ids) this.slangMutation = updateSlangBatch(state,payload,this.now());
      else {updateSlang(state, payload, this.now());this.slangMutation={updated:1,skipped:0};}
      this.save();
      return {...this.status(),slangMutation:this.slangMutation};
    } finally { unlock(); }
  }
  async learn(a, current, input, postId, force = false) {
    if ((!force && !this.data.config.slangLearning) || !current() || !sourceText(input).trim()) return;
    const state = slangState(a);
    if (state.sources.includes(sourceKey(input))) return;
    let decision;
    try {
      decision = await this.generate({ kind:"slang", sources:slangSources(input), knownTerms:state.entries.map(v=>({term:v.term,status:v.status})) }, this.data.config, {signal:this.controller.signal,directory:this.directory});
      if (!current()) return;
      learnSlang(state, decision, input, {postId,now:this.now()});
    } catch (e) {
      if (!current()) return;
      // Extraction failures never become learned facts or block ordinary reading.
      this.log("error", "黑话学习失败，本次未更新词库");
      return false;
    }
    this.save();
    return true;
  }
  async explainSlang(state, input, signal) {
    const config = this.data.config;
    const options = {signal,directory:this.directory};
    if (config.generationProvider !== "dsh") return this.generate(input,config,options);
    // Reserve each submitted term before spawning, including failed/interrupted attempts.
    // A failed result must not fragment a batch into fresh conversations.
    const mode = input.kind;
    const launcher = JSON.stringify([config.dshCommand,config.nodePath]);
    let session = state.conversation;
    if (session?.protocol !== 2 || !/^session-heybox-slang-[a-f0-9-]{36}$/.test(session.id) || !Number.isInteger(session.used) || session.used < 0 || session.used >= config.slangSessionTerms) {
      session = state.conversation = {protocol:2,id:`session-heybox-slang-${crypto.randomUUID()}`,used:0,ready:false,mode,launcher};
    }
    options.session = {id:session.id,resume:session.attempted === true || session.used > 0};
    session.mode=mode; session.launcher=launcher;
    session.used++; session.ready=false; session.attempted=true;
    this.save();
    let result;
    try { result = await this.generate(input,config,options); }
    catch(error) {
      if(error.slangTurnStarted === false){session.used--;this.save();}
      throw error;
    }
    if (!signal.aborted) { session.ready=true; this.save(); }
    return result;
  }
  runSlang(payload, automaticJobs) {
    if (this.running || this.closed) throw new Error("任务正在运行或宿主已停止");
    if (this.fault) throw new Error(this.fault);
    const selected = this.account();
    if (!selected?.id || payload.accountId !== selected.id) throw new Error("请登录当前账号并刷新词库");
    const account = {...selected};
    const unlock = this.lock();
    try {
      this.reload();
      const a = this.accountState(account), state = slangState(a);
      const extracting = payload.action === "extract";
      const mode = this.data.config.slangResearchMode;
      if (!extracting && payload.action !== "research") throw new Error("黑话任务无效");
      const jobs = extracting ? (automaticJobs || this.contexts(account)).filter(v=>!state.sources.includes(v.key || sourceKey(v.input))) : (()=>{
        if (!Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 500 || new Set(payload.ids).size !== payload.ids.length) throw new Error("请选择 1–500 个待确认的词解释");
        return payload.ids.map(id=>{
          const entry=state.entries.find(v=>v.id === id && v.status === "pending");
          if (!entry) throw new Error("只能研究当前账号的候选词，请刷新后重试");
          return entry;
        });
      })();
      if (!jobs.length) throw new Error("暂无未提取的文本，请先运行浏览或回复检查，再提取候选");
      if (!extracting && mode === "web" && typeof this.search !== "function") throw new Error("DSH 搜索服务未配置，请配置搜索服务或切换为「当前模型解析」");
      this.controller = new AbortController();
      const signal = this.controller.signal, revision = this.revision;
      const current = ()=>!this.closed && !signal.aborted && this.revision === revision && this.account()?.id === account.id && this.account()?.identity === account.identity;
      this.runningKind = "slang";
      this.slangTask = {accountId:account.id,kind:extracting ? "extract" : "research",mode,total:jobs.length,done:0,failed:0,currentTerm:""};
      this.running = Promise.resolve().then(async()=>{
        for (const job of jobs) {
          if (!current()) break;
          this.slangTask.currentTerm = extracting ? job.input.post?.title || "文本语境" : job.term;
          let stage = "generation";
          try {
            if (extracting) {
              if (await this.learn(a,current,job.input,job.postId,true) === false) this.slangTask.failed++;
            } else if (mode === "context") {
              const decision = await this.explainSlang(state,{kind:"slang-explain",term:job.term,evidence:job.sources || []},signal);
              if (!current()) break;
              stage = "evidence";
              applySlangExplanation(job,decision,this.now());
            } else {
              stage = "search";
              const query = `${job.term} 网络用语 梗 含义 ${(job.sources?.[0]?.title || "").slice(0,60)}`;
              // Search is a host read operation. Model tools remain disabled.
              const result = await searchSlang(this.search,{query,maxResults:6},signal);
              if (!current()) break;
              const sources = researchSources(result);
              if (!sources.length) throw Object.assign(new Error("没有可核对的搜索结果"),{code:"WEB_SEARCH_NO_RESULTS"});
              stage = "generation";
              const decision = await this.explainSlang(state,{kind:"slang-research",term:job.term,evidence:job.sources || [],searchSources:sources},signal);
              if (!current()) break;
              stage = "evidence";
              applySlangResearch(job,decision,sources,this.now());
            }
          } catch (error) {
            if (error.persistence) throw error;
            if (!current()) break;
            if(error.slangTurnStarted === false){this.slangTask.pausedReason=error.message;break;}
            this.slangTask.failed++;
            if (!extracting) job.research={...job.research,status:"error",mode,at:this.now(),...slangResearchFailure(error,stage)};
          }
          if (!current()) break;
          this.slangTask.done++;this.save();
        }
      }).catch(()=>{try {this.log("error","黑话任务中断，请检查状态后重试");}catch {this.fault="保存黑话状态失败，任务已停止";}}).finally(()=>{
        this.slangTask.currentTerm="";
        try {this.save();} catch {this.fault="保存黑话状态失败，任务已停止";}
        finally {this.running=null;this.runningKind=null;unlock();queueMicrotask(()=>this.drain());}
      });
      return this.status();
    } catch (error) {unlock();throw error;}
  }
}
