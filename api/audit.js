export const access = "public";
export const methods = ["POST"];

const stripTags = html => String(html || "")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;|&#160;/gi," ")
  .replace(/\s+/g," ")
  .trim();

const decode = s => String(s||"")
 .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
 .replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'");

function textMatches(html,tag){
 const out=[]; const re=new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","gi"); let m;
 while((m=re.exec(String(html||"")))) out.push(decode(stripTags(m[1])));
 return out.filter(Boolean);
}
function safeHost(v){try{return new URL(v).hostname.toLowerCase()}catch{return""}}
function clamp(n){return Math.max(0,Math.min(100,Math.round(n)))}
function gradeFor(s){return s>=90?"A":s>=80?"B":s>=70?"C":s>=60?"D":"F"}
function imageAltStats(html){
 const tags=String(html||"").match(/<img\b[^>]*>/gi)||[]; let withAlt=0;
 for(const tag of tags){const m=tag.match(/\balt\s*=\s*["']([^"']*)["']/i);if(m&&m[1].trim())withAlt++}
 return {imageTags:tags.length,withAlt};
}
function normalizeUrl(v){try{const u=new URL(v);u.hash="";return u.href.replace(/\/$/,"")}catch{return v}}
function tokenSet(q){return String(q||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>2)}
function snippetRelevance(snippet,query){
 const toks=tokenSet(query); if(!toks.length)return 0;
 const s=String(snippet||"").toLowerCase(); const hits=toks.filter(t=>s.includes(t)).length;
 return Math.round((hits/toks.length)*100);
}
function parseMaybeJson(v){
 if(v&&typeof v==="object") return v;
 if(typeof v!=="string") return {};
 try{return JSON.parse(v)}catch{}
 const m=v.match(/\{[\s\S]*\}/); if(m){try{return JSON.parse(m[0])}catch{}}
 return {summary:String(v||"").slice(0,500)};
}

export default async function(req,res){
 try{
   const body=req.body||{}; const url=String(body.url||"").trim(); const apiKey=String(body.apiKey||"").trim(); let query=String(body.query||"").trim();
   if(!url||!/^https?:\/\//i.test(url)) return res.status(400).json({error:"Enter a valid public http or https URL."});
   if(!apiKey||apiKey.length<12) return res.status(400).json({error:"Enter a valid TinyFish API key."});

   // ENDPOINT 1: FETCH — live machine-readable extraction
   const fetchResp=await fetch("https://api.fetch.tinyfish.ai",{
     method:"POST",
     headers:{"content-type":"application/json","X-API-Key":apiKey},
     body:JSON.stringify({urls:[url],format:"html",links:true,image_links:true,ttl:0,per_url_timeout_ms:45000,purpose:"Audit this live page for AI readability, structure, metadata, links and images."})
   });
   let fetchPayload={}; try{fetchPayload=await fetchResp.json()}catch{}
   if(!fetchResp.ok){
     if(fetchResp.status===401)return res.status(401).json({error:"TinyFish rejected the API key."});
     if(fetchResp.status===402)return res.status(402).json({error:"TinyFish says the wallet cannot start this request."});
     if(fetchResp.status===429)return res.status(429).json({error:"TinyFish rate limit reached. Try again shortly."});
     return res.status(502).json({error:"TinyFish Fetch failed: "+String(fetchPayload?.error?.message||fetchPayload?.error||fetchResp.status)});
   }
   const page=fetchPayload?.results?.[0]; const fetchErr=fetchPayload?.errors?.[0];
   if(!page)return res.status(422).json({error:"Fetch could not read this live page: "+String(fetchErr?.error||"no result")});

   const html=String(page.text||""); const finalUrl=page.final_url||url; const title=String(page.title||""); const description=String(page.description||"");
   const h1s=textMatches(html,"h1"); const h2s=textMatches(html,"h2"); const plain=stripTags(html); const wordCount=plain?plain.split(/\s+/).filter(Boolean).length:0;
   const links=Array.isArray(page.links)?page.links:[]; const images=Array.isArray(page.image_links)?page.image_links:[];
   const baseHost=safeHost(finalUrl); let internalLinks=0,externalLinks=0;
   for(const link of links){const host=safeHost(link);if(!host)continue;if(host===baseHost||host.endsWith("."+baseHost)||baseHost.endsWith("."+host))internalLinks++;else externalLinks++}
   const {imageTags,withAlt}=imageAltStats(html); const imageCount=Math.max(images.length,imageTags); const altCoverage=imageTags?Math.round(withAlt/imageTags*100):null;

   let queryInferred=false;
   if(!query){
     const seed=(h1s[0]||title||baseHost).replace(/[|–—:-].*$/,"").trim();
     query=seed.split(/\s+/).slice(0,8).join(" ")||baseHost;
     queryInferred=true;
   }

   // ENDPOINT 2: SEARCH — live query visibility
   let search={ok:false,found:false,bestPosition:null,result:null,error:null}; let searchSub=35;
   try{
     const params=new URLSearchParams({query,purpose:"Measure whether the audited live page/domain is visible for this target query and inspect its search snippet."});
     const sr=await fetch("https://api.search.tinyfish.ai?"+params.toString(),{headers:{"X-API-Key":apiKey}});
     const sp=await sr.json();
     if(!sr.ok) throw new Error(sp?.error?.message||sp?.error||("HTTP "+sr.status));
     const results=Array.isArray(sp.results)?sp.results:[];
     const targetNorm=normalizeUrl(finalUrl); const targetHost=safeHost(finalUrl);
     let hit=results.find(x=>normalizeUrl(x.url)===targetNorm);
     if(!hit)hit=results.find(x=>safeHost(x.url)===targetHost||safeHost(x.url).endsWith("."+targetHost));
     search.ok=true; search.found=!!hit; search.result=hit||null; search.bestPosition=hit?.position||null;
     if(hit){
       const rel=snippetRelevance(hit.snippet,query);
       searchSub=clamp(100-Math.max(0,(hit.position||10)-1)*6-(rel<40?12:0));
       search.snippetRelevance=rel;
     }else searchSub=25;
   }catch(e){search.error=String(e?.message||e);searchSub=30}

   // ENDPOINT 3: AGENT — start asynchronously so the app never loses the run to an HTTP timeout
   let agent={ok:false,running:false,partial:false,runId:null,summary:null,canRead:[],mayMiss:[],error:null}; let agentSub=50;
   try{
     const schema={
       type:"object",
       properties:{
         summary:{type:"string"},
         rendered_title:{type:"string"},
         rendered_h1:{type:"string"},
         main_content_readable:{type:"boolean"},
         main_content_summary:{type:"string"},
         requires_interaction:{type:"boolean"},
         interaction_details:{type:"string"},
         js_or_rendering_dependency:{type:"boolean"},
         js_dependency_details:{type:"string"},
         blocked_or_gated:{type:"boolean"},
         blocked_details:{type:"string"},
         important_content_visible:{type:"array",items:{type:"string"}},
         important_content_may_be_missed:{type:"array",items:{type:"string"}}
       },
       required:["summary","main_content_readable","requires_interaction","js_or_rendering_dependency","blocked_or_gated","important_content_visible","important_content_may_be_missed"]
     };
     const ar=await fetch("https://agent.tinyfish.ai/v1/automation/run-async",{
       method:"POST",
       headers:{"content-type":"application/json","X-API-Key":apiKey},
       body:JSON.stringify({
         url:finalUrl,
         goal:"Inspect only the initially rendered page. Do not click, scroll deeply, log in, or explore other pages. Read the rendered title, H1, and main visible content. Report whether the main content is readable immediately, whether key content appears gated, and whether the rendered page materially differs from simple text extraction. Return only the requested structured fields.",
         output_schema:schema,
         browser_profile:"lite",
         agent_config:{max_duration_seconds:90}
       })
     });
     let ap={}; try{ap=await ar.json()}catch{}
     if(!ar.ok)throw new Error(ap?.error?.message||ap?.error||("HTTP "+ar.status));
     if(!ap?.run_id)throw new Error("Agent did not return a run ID.");
     agent.running=true; agent.runId=ap.run_id; agent.summary="Browser-readability check running asynchronously";
     agentSub=50;
   }catch(e){agent.error=String(e?.message||e);agent.partial=true;agentSub=45}

   // FETCH subscore + actionable evidence
   const issues=[]; let fetchSub=100;
   const add=(pts,severity,titleText,detail)=>{fetchSub-=pts;issues.push({severity,title:titleText,detail})};
   if(!title)add(18,"high","Missing page title","TinyFish Fetch did not detect a title. Add a unique, descriptive <title> that names this page.");
   else if(title.length<30)add(7,"medium","Title is short","Fetch detected a "+title.length+"-character title. Expand it if needed to state the page topic clearly.");
   else if(title.length>60)add(6,"medium","Title may truncate","Fetch detected a "+title.length+"-character title. Tighten it so the main intent appears earlier.");
   if(!description)add(14,"high","Missing meta description","TinyFish Fetch did not detect a meta description. Add one that accurately summarizes this specific page.");
   else if(description.length<100)add(5,"medium","Meta description is brief","The detected description is "+description.length+" characters; add useful context if the current snippet undersells the page.");
   else if(description.length>165)add(5,"medium","Meta description may truncate","The detected description is "+description.length+" characters; shorten it around the most important promise.");
   if(h1s.length===0)add(14,"high","No H1 detected","Fetch could not detect an H1. Add one visible primary heading that states the page's core topic.");
   else if(h1s.length>1)add(6,"medium","Multiple H1s detected","Fetch detected "+h1s.length+" H1 elements. Keep one dominant primary heading unless the document structure genuinely requires otherwise.");
   if(wordCount<150)add(12,"high","Very little readable content","TinyFish Fetch extracted about "+wordCount+" words. Add useful indexable copy if the page is expected to compete for this query.");
   else if(wordCount<300)add(6,"medium","Light readable content","TinyFish Fetch extracted about "+wordCount+" words. Check whether key answers are hidden in images, scripts or interactions.");
   if(internalLinks===0)add(8,"medium","No internal links detected","Fetch found no internal links. Add contextual links to closely related pages so users and crawlers can continue through the site.");
   if(imageCount>0&&altCoverage!==null&&altCoverage<80)add(6,"medium","Weak image alt coverage","Only "+altCoverage+"% of detected image tags had non-empty alt text. Add descriptive alt text to meaningful images.");
   if(!page.language)add(3,"low","Language not detected","TinyFish did not detect a page language. Make the document language explicit.");
   if(!/^https:\/\//i.test(finalUrl))add(6,"medium","Page is not HTTPS","Serve the canonical page over HTTPS.");
   if(h2s.length===0&&wordCount>500)add(3,"low","Long content lacks H2 structure","Fetch found substantial text but no H2 headings. Break major sections into descriptive headings.");
   fetchSub=clamp(fetchSub);

   // Search-specific same-day fix
   if(search.ok&&!search.found){
     issues.unshift({severity:"high",title:"Target page not visible in returned search results",detail:"For query '"+query+"', TinyFish Search did not return the target domain/page. Review query-page alignment, title/H1 wording, crawlability, and whether a more specific landing page should target this intent."});
   }else if(search.ok&&search.found&&search.bestPosition>5){
     issues.unshift({severity:"medium",title:"Search visibility is weak for the target query",detail:"TinyFish Search returned the target at position #"+search.bestPosition+" for '"+query+"'. Strengthen direct query alignment in the title, H1 and opening copy, and compare the wording of higher-ranked results."});
   }else if(!search.ok){
     issues.push({severity:"medium",title:"Search visibility check did not complete",detail:"Fetch still completed, but Search returned an error. Retry the same live audit before submitting a visibility conclusion."});
   }

   // Agent-specific actionable fixes
   if(!agent.ok&&!agent.running)issues.push({severity:"low",title:"Agent browser-readability check incomplete",detail:"Search and Fetch results are still useful, but rerun Agent before final submission to compare rendered content with machine extraction."});

   const completed=(search.ok?1:0)+1+((agent.ok||agent.running)?1:0);
   const score=clamp(fetchSub*.4+searchSub*.35+agentSub*.25);
   const canRead=[
     title?("Title: "+title):null,
     h1s[0]?("Primary heading: "+h1s[0]):null,
     wordCount?("About "+wordCount+" words of extractable content"):null,
     internalLinks?internalLinks+" internal links":null,
     ...(agent.canRead||[])
   ].filter(Boolean).slice(0,8);
   const mayMiss=[
     ...(agent.mayMiss||[]),
     imageCount>0&&altCoverage!==null&&altCoverage<80?("Meaningful image context may be lost because alt coverage is "+altCoverage+"%."):null,
     search.ok&&!search.found?("The page is readable enough to audit but was not visible for the target query in returned results."):null
   ].filter(Boolean).slice(0,8);

   let visibilityComparison;
   if(search.ok&&search.found&&fetchSub>=75)visibilityComparison="The page is both machine-readable and visible for the target query. The next gains are likely in ranking strength and snippet quality rather than basic readability.";
   else if(search.ok&&!search.found&&fetchSub>=75)visibilityComparison="TinyFish can read the page well, but Search did not surface it for the target query. This points to a visibility/query-alignment gap rather than a pure extraction problem.";
   else if(search.ok&&search.found&&fetchSub<75)visibilityComparison="The page appears in Search, but Fetch exposes readability/structure weaknesses. Improving machine-readable structure may help AI systems understand and represent the page more reliably.";
   else visibilityComparison="The audit found both readability and visibility weaknesses. Fix the high-severity extraction issues first, then rerun Search for the same target query.";

   return res.json({
     url,finalUrl,title,description,language:page.language||null,latencyMs:page.latency_ms||null,
     queryUsed:query,queryInferred,
     score,grade:gradeFor(score),subscores:{search:searchSub,fetch:fetchSub,agent:agentSub},
     titleLength:title.length,descriptionLength:description.length,h1Count:h1s.length,h1s,h2Count:h2s.length,
     linkCount:links.length,internalLinks,externalLinks,imageCount,imageAltCoverage:altCoverage,wordCount,
     search,fetch:{ok:true},agent,issues,canRead,mayMiss,visibilityComparison,
     endpointsCompleted:completed
   });
 }catch(err){
   return res.status(500).json({error:"Audit failed unexpectedly: "+String(err?.message||err)});
 }
}