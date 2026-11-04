import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Same lifecycle as DSH's headless runner, with an explicitly owned reusable session.
export const inject = ["headlessStartup", "agentDefaultModel", "agents", "sessions", "sessionQuery", "sessionPersistence", "heyboxGenerationGuard"];

async function hasOwnedSession(ctx, id) {
  const query=ctx.get("sessionQuery");
  if (!query || !ctx.get("sessionPersistence")) throw new Error("Persistent session query is required");
  let observation;
  try {
    // New hosts return a disposable observation; older hosts return a detached log.
    observation=typeof query.observeSession === "function" ? await query.observeSession(id) : null;
    const header=observation ? observation.header : (await query.readSession(id)).session;
    if (header.id !== id || header.cwd !== process.cwd() || header.origin === "subagent" || header.parentSession !== undefined || header.agentPreset !== undefined) throw new Error("Unexpected slang session ownership");
    return true;
  } catch (error) {
    // The first attempt may have failed before creating any session. Keep its ID.
    // Corruption, lock contention and other read errors must never become new chats.
    if (error.code === "SESSION_QUERY_SESSION_NOT_FOUND") return false;
    throw error;
  } finally { observation?.[Symbol.dispose]?.(); }
}

export async function runSlangTurn(ctx, config, {installModelSelection,createUserMessage}, io) {
  if (!/^session-heybox-slang-[a-f0-9-]{36}$/.test(config.sessionId) || typeof config.resume !== "boolean") throw new Error("Invalid slang session");
  await ctx.get("loader")?.await();
  const agents=ctx.get("agents"), sessions=ctx.get("sessions");
  const selection=ctx.get("agentDefaultModel").currentSelection();
  const options={
    agentOptions:{provider:selection.provider,model:selection.model},
    setup:agentCtx=>{installModelSelection(agentCtx,{current:selection,assembled:undefined});},
  };
  const resume=config.resume && await hasOwnedSession(ctx,config.sessionId);
  const {agent}=resume
    ? await agents.resume({...options,resumeSessionId:config.sessionId})
    : await agents.create({...options,sessionId:config.sessionId,meta:{cwd:process.cwd()}});
  await agent.whenIdle();
  const firstSeq=agent.session.seq;
  io.stderr.write(`heybox-session-started:${agent.session.id}\n`);
  agent.followup(createUserMessage({content:[{type:"text",text:config.task}],source:{kind:"user"}}));
  await agent.whenIdle();
  await sessions.flush(agent.session);
  // Only this turn's output is a decision; never accidentally accept a previous term.
  let started=false, text="", reason;
  const events=typeof agent.session.eventAt === "function"
    ? (function*(){for(let seq=firstSeq;seq<agent.session.seq;seq++) {const event=agent.session.eventAt(seq);if(!event)throw new Error("Missing session event");yield event;}})()
    : agent.session.events;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") {started=true;continue;}
    if (!started) continue;
    if (event.type === "assistant/message") {
      const joined=event.data.message.content.filter(v=>v.type === "text").map(v=>v.text).join("");
      if (joined) text=joined;
    }
    if (event.type === "turn/end") reason=event.data.reason;
  }
  if (agent.session.id !== config.sessionId) throw new Error("Unexpected session identity");
  io.stderr.write(`heybox-session-saved:${agent.session.id}\n`);
  io.stdout.write(text+"\n");
  if (reason?.kind !== "completed") io.stderr.write("dsh: SLANG_TURN_FAILED: Slang generation did not complete\n");
  io.exit(reason?.kind === "completed" ? 0 : 1);
}

export function apply(ctx, config) {
  const exit=ctx.get("appExit");
  if (!exit) throw new Error("Slang runner requires the DSH launcher");
  // Resolve through the running host, avoiding a second copy of DSH's service modules.
  const hostRequire=createRequire(fs.realpathSync(process.argv[1]));
  Promise.all([
    import(pathToFileURL(hostRequire.resolve("@deepseek-ai/dsh-agent")).href),
    import(pathToFileURL(hostRequire.resolve("@deepseek-ai/dsh-llm")).href),
  ]).then(([agent,llm])=>runSlangTurn(ctx,config,{installModelSelection:agent.installModelSelection,createUserMessage:llm.createUserMessage},{stdout:process.stdout,stderr:process.stderr,exit}))
    .catch(error=>{const code=error?.name === "SessionAlreadyOwnedError" ? "SLANG_SESSION_BUSY" : "SLANG_SESSION_FAILED";process.stderr.write(`dsh: ${code}: Cannot open slang session\n`);exit(1);});
}
