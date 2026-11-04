import fs from "node:fs";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {generateDecision,decisionMessages} from "./generator.js";
import {parseSlangExplanation,parseSlangResearch} from "./slang.js";

const blocked=message=>Object.assign(new Error(message),{slangTurnStarted:false});
let hostMessage;
async function messageFactory() {
  if (!hostMessage) {
    const require=createRequire(fs.realpathSync(process.argv[1]));
    hostMessage=(await import(pathToFileURL(require.resolve("@deepseek-ai/dsh-llm")).href)).createUserMessage;
  }
  return hostMessage;
}

// A session opened in the web app already has a writer in this process.
// Use that exact Agent instead of competing for its file lock in a subprocess.
export function createHostSlangGenerator(ctx,{generate=generateDecision,createUserMessage}={}) {
  return async(input,config,options)=>{
    const eligible=config.generationProvider === "dsh" && options.session && ["slang-explain","slang-research"].includes(input.kind);
    const live=()=>eligible ? ctx.get("agents")?.get(options.session.id) : undefined;
    let agent=live();
    if (!agent) {
      try {return await generate(input,config,options);}
      catch(error) {
        if (error.code !== "SLANG_SESSION_BUSY" || !(agent=live())) throw error;
      }
    }
    const makeMessage=createUserMessage || await messageFactory();
    const header=agent.session.header;
    if (!/^session-heybox-slang-[a-f0-9-]{36}$/.test(options.session.id) || live() !== agent || header.id !== options.session.id || header.cwd !== fs.realpathSync(options.directory) || header.origin === "subagent" || header.parentSession !== undefined || header.agentPreset !== undefined) throw blocked("黑话对话归属不符，已暂停解释");
    if (options.signal.aborted) throw blocked("任务已取消");
    if (agent.status !== "idle") await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(blocked("任务已取消"));};
      const timer=setTimeout(()=>{options.signal.removeEventListener("abort",abort);reject(blocked("这个黑话对话仍在处理其他消息，已暂停；空闲后可继续解释"));},config.generationTimeoutSeconds*1000);
      options.signal.addEventListener("abort",abort,{once:true});
      agent.whenIdle().then(resolve,()=>reject(blocked("黑话对话已关闭，请稍后重试"))).finally(()=>{clearTimeout(timer);options.signal.removeEventListener("abort",abort);});
    });
    if(options.signal.aborted || live() !== agent || agent.status !== "idle")throw blocked("黑话对话状态已改变，已暂停解释");
    const tools=ctx.get("tools"),sessions=ctx.get("sessions");
    if (!tools?.guard || !sessions?.flush) throw blocked("宿主缺少会话或工具保护服务，已暂停解释");
    const message=makeMessage({content:[{type:"text",text:decisionMessages(input,config).map(v=>v.content).join("\n")}],source:{kind:"user"}});
    return new Promise((resolve,reject)=>{
      const firstSeq=agent.session.seq;
      let admitted=false,owned=false,settled=false,contaminated=false,text="",timer;
      const disposers=[];
      const finish=(error)=>{
        if(settled)return;settled=true;
        clearTimeout(timer);options.signal.removeEventListener("abort",abort);
        for(const dispose of disposers)dispose();
        Promise.resolve().then(()=>sessions.flush(agent.session)).then(()=>{
          if(error)throw error;
          if(contaminated)throw new Error("解释期间收到了其他消息，本轮结果未采用");
          return (input.kind === "slang-explain" ? parseSlangExplanation : parseSlangResearch)(text);
        }).then(resolve,error=>{error.slangTurnStarted=admitted;reject(error);});
      };
      const cancel=reason=>{
        if(settled)return;
        // Remove only our pending message; preserve other user's queued messages.
        agent.inbox?.remove(message.id);
        if(admitted)agent.cancel({kind:"user"},{keepInbox:true});
        finish(new Error(reason));
      };
      const abort=()=>cancel("任务已取消");
      try {
        disposers.push(tools.guard(execution=>execution.agent === agent && !settled ? "HeyBox slang generation is text-only; tools are disabled." : undefined));
        disposers.push(ctx.on("session/event",(session,event)=>{
          if(session !== agent.session || event.seq < firstSeq || settled)return;
          if(event.type === "user/message") {
            const data=event.data.message || event.data;
            if(data.id === message.id)owned=true;
            else if(owned && data.source?.kind === "user")contaminated=true;
          }
          if(!owned)return;
          if(event.type === "assistant/message")text=event.data.message.content.filter(v=>v.type === "text").map(v=>v.text).join("");
          if(event.type === "turn/end")finish(event.data.reason?.kind === "completed" ? null : new Error("DSH 黑话解释未完成"));
        }));
        disposers.push(ctx.on("agent/disposed",({agent:subject})=>{if(subject === agent)finish(new Error("黑话会话已关闭，本轮解释未完成"));}));
        timer=setTimeout(()=>cancel("DSH 生成超时"),config.generationTimeoutSeconds*1000);
        options.signal.addEventListener("abort",abort,{once:true});
        admitted=true;agent.followup(message);
      } catch(error){finish(error);}
    });
  };
}
