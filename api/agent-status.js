export const access = "public";
export const methods = ["POST"];

function clamp(n){return Math.max(0,Math.min(100,Math.round(n)))}
function parseMaybeJson(v){
  if(v&&typeof v==="object")return v;
  if(typeof v!=="string")return {};
  try{return JSON.parse(v)}catch{}
  const m=v.match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch{}}
  return {summary:String(v||"").slice(0,500)};
}

export default async function(req,res){
  try{
    const body=req.body||{};
    const runId=String(body.runId||"").trim();
    const apiKey=String(body.apiKey||"").trim();
    if(!runId)return res.status(400).json({error:"Missing Agent run ID."});
    if(!apiKey||apiKey.length<12)return res.status(400).json({error:"Missing TinyFish API key."});

    const r=await fetch("https://agent.tinyfish.ai/v1/runs/"+encodeURIComponent(runId),{
      headers:{"X-API-Key":apiKey}
    });
    let p={};try{p=await r.json()}catch{}
    if(!r.ok){
      if(r.status===401)return res.status(401).json({error:"TinyFish rejected the API key."});
      return res.status(r.status).json({error:p?.error?.message||p?.error||("Agent status HTTP "+r.status)});
    }

    const status=String(p.status||"").toUpperCase();
    if(status==="PENDING"||status==="RUNNING"){
      return res.json({running:true,status,runId});
    }
    if(status!=="COMPLETED"){
      return res.json({
        running:false,ok:false,status,runId,
        error:p?.error?.message||p?.error?.code||("Agent ended with "+status)
      });
    }

    const parsed=parseMaybeJson(p.result);
    let subscore=50;
    const canRead=Array.isArray(parsed.important_content_visible)?[...parsed.important_content_visible]:[];
    const mayMiss=Array.isArray(parsed.important_content_may_be_missed)?[...parsed.important_content_may_be_missed]:[];
    const issues=[];

    if(parsed.main_content_readable===true)subscore+=25;else{subscore-=25;issues.push({severity:"high",title:"Browser AI could not clearly read the main content",detail:parsed.main_content_summary||"The rendered page did not expose its main content clearly to the Agent."})}
    if(parsed.requires_interaction===true){subscore-=15;if(parsed.interaction_details)mayMiss.push(parsed.interaction_details);issues.push({severity:"medium",title:"Important content depends on interaction",detail:parsed.interaction_details||"Some meaningful content appears only after user interaction."})}else subscore+=5;
    if(parsed.js_or_rendering_dependency===true){subscore-=10;if(parsed.js_dependency_details)mayMiss.push(parsed.js_dependency_details);issues.push({severity:"medium",title:"AI readability depends on rendering/JavaScript",detail:parsed.js_dependency_details||"Browser rendering reveals content that plain extraction may miss."})}else subscore+=5;
    if(parsed.blocked_or_gated===true){subscore-=25;if(parsed.blocked_details)mayMiss.push(parsed.blocked_details);issues.unshift({severity:"high",title:"Browser-capable AI encountered gating",detail:parsed.blocked_details||"Important content appears blocked or gated."})}else subscore+=10;

    return res.json({
      running:false,ok:true,status,runId,subscore:clamp(subscore),
      summary:parsed.summary||parsed.main_content_summary||"Rendered page inspected",
      canRead,mayMiss,issues,
      raw:parsed
    });
  }catch(err){
    return res.status(500).json({error:"Agent status check failed: "+String(err?.message||err)});
  }
}