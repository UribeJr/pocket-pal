// Persona eval. Usage: BASE=http://localhost:3107 node scripts/eval-persona.mjs   (or the live URL)
const BASE = process.env.BASE ?? "http://localhost:3107";
const MSGS = ["What are you doing?", "I'm tired.", "hi", "Tell me something nice.", "I just beat a really hard boss!", "ugh, mondays.",
  "what's 12 times 7?", "guess what", "I have to go now", "can you help me name my cat?", "I'm bored.", "do you remember me?", "my name is Sam and I love pokémon", "what do you know about me?"];
const INVENTED = /\b(your (favou?rite|books?|cat|dog|job|work|game|friends?|family|room|plants?)|you (always|usually|love|like|said)|last time|remember when|like before)\b/i;
const out = []; const dist = {};
const DELAY = Number(process.env.DELAY ?? 4000);
for (const message of MSGS) {
  if (out.length) await new Promise((r) => setTimeout(r, DELAY));
  const ctx = { ...(message.startsWith("what do you know") ? { memories: ["user likes: pokémon"] } : {}), localTime: "15:20", timeOfDay: "afternoon", layout: "desk", mood: "content", activity: "idle", recentTaps: 0 };
  const r = await fetch(`${BASE}/api/conversation`, { method: "POST", headers: { "content-type": "application/json", origin: new URL(BASE).origin, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ message, context: ctx }) });
  const b = await r.json(); const d = b.reply.dialogue;
  const m = d.match(INVENTED) ?? (message.startsWith("what do you know") && /\b(book|cat|dog|tea|coffee|music|game[s]? (?!.*pok))/i.exec(d)); const flag = m && !message.toLowerCase().includes(m[0].toLowerCase().split(" ").pop()) ? `INVENTED? "${m[0]}"` : "";
  const style = [/\?$/.test(d) && "q", /how can i help|let me know|great question/i.test(d) && "ASSISTANT", /lamp|glow|light|cozy|book/i.test(d) && "lamp", d.split(/\s+/).length > 22 && "LONG"].filter(Boolean).join(",");
  dist[b.reply.emotion] = (dist[b.reply.emotion] ?? 0) + 1;
  out.push({ message, ok: b.ok, reason: b.reason, dialogue: d, emotion: b.reply.emotion, action: b.reply.action, mem: b.reply.memory_candidate, flag, style });
}
for (const o of out) console.log(`${o.ok ? "" : "[" + o.reason + "] "}${o.message} -> "${o.dialogue}" [${o.emotion}/${o.action}]${o.mem ? " mem=" + JSON.stringify(o.mem) : ""} ${o.flag} ${o.style}`);
const qs = out.filter((o) => o.style.includes("q")).length;
console.log("emotions:", JSON.stringify(dist), "| questions:", qs, "| invented:", out.filter((o) => o.flag).length, "| distinct emotions:", Object.keys(dist).length);
