const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const grade=s=>s>=90?'A':s>=80?'B':s>=70?'C':s>=60?'D':'F';
document.querySelectorAll('.demo').forEach(b=>b.addEventListener('click',()=>{$('url').value=b.dataset.url;$('query').value=b.dataset.query||'';}));

function renderIssues(items){
  $('issueCount').textContent=items.length+(items.length===1?' issue':' issues');
  $('issues').innerHTML=items.length?items.map(i=>`<article class="issue"><div class="issue-title"><span class="severity ${esc(i.severity)}">${esc(i.severity)}</span>${esc(i.title)}</div><p>${esc(i.detail)}</p></article>`).join(''):'<p class="muted">No material issues detected in the completed checks.</p>';
}
function renderList(id,arr,empty){$(id).innerHTML=(arr&&arr.length)?arr.map(x=>'<li>'+esc(x)+'</li>').join(''):'<li class="muted">'+esc(empty)+'</li>'}
function renderSnapshot(d){
 const rows=[['Final URL',d.finalUrl||d.url],['Title',d.title||'Not detected'],['Meta description',d.description||'Not detected'],['Language',d.language||'Not detected'],['H1',(d.h1s||[]).join(' · ')||'None detected'],['Internal links',d.internalLinks],['External links',d.externalLinks],['Search rank',d.search?.bestPosition||'Not in returned results'],['Fetch latency',d.latencyMs?Math.round(d.latencyMs)+' ms':'—']];
 $('snapshot').innerHTML=rows.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('');
}
function endpointState(ok,partial,running){return ok?'Completed':running?'Running…':partial?'Partial':'Unavailable'}

async function pollAgent(d,apiKey){
  if(!d.agent?.running||!d.agent?.runId)return;
  $('agentStatus').textContent='Running…';
  $('agentDetail').textContent='TinyFish Agent is inspecting the rendered page in the background.';
  $('agentSub').textContent='pending';
  const statusBox=$('status');
  statusBox.className='status';
  statusBox.textContent='Search + Fetch are complete. Waiting for TinyFish Agent to finish the browser-readability check…';

  for(let attempt=0;attempt<20;attempt++){
    if(attempt>0)await sleep(8000);
    try{
      const r=await fetch('/api/agent-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId:d.agent.runId,apiKey})});
      const a=await r.json();
      if(!r.ok)throw new Error(a.error||'Agent status failed');
      if(a.running){
        statusBox.textContent='Agent still running… Search + Fetch results are already available. This can take a minute or two.';
        continue;
      }
      if(!a.ok){
        $('agentStatus').textContent='Partial';
        $('agentDetail').textContent=a.error||('Agent ended: '+a.status);
        $('agentSub').textContent='45/100';
        statusBox.className='status error';
        statusBox.textContent='Search + Fetch completed, but Agent did not finish: '+(a.error||a.status);
        return;
      }

      d.subscores.agent=a.subscore;
      const newScore=Math.max(0,Math.min(100,Math.round(d.subscores.fetch*.4+d.subscores.search*.35+a.subscore*.25)));
      $('score').textContent=newScore+'/100';
      $('grade').textContent=grade(newScore);
      $('agentStatus').textContent='Completed';
      $('agentDetail').textContent=a.summary||'Browser readability analyzed';
      $('agentSub').textContent=a.subscore+'/100';

      const baseIssues=(d.issues||[]).filter(i=>i.title!=='Agent browser-readability check incomplete');
      d.issues=[...baseIssues,...(a.issues||[])];
      renderIssues(d.issues);

      d.canRead=[...(d.canRead||[]),...(a.canRead||[])].filter((x,i,arr)=>x&&arr.indexOf(x)===i).slice(0,10);
      d.mayMiss=[...(d.mayMiss||[]),...(a.mayMiss||[])].filter((x,i,arr)=>x&&arr.indexOf(x)===i).slice(0,10);
      renderList('canRead',d.canRead,'No positive readability signals returned.');
      renderList('mayMiss',d.mayMiss,'No major browser-only gaps detected.');

      statusBox.classList.add('hidden');
      $('apiKey').value='';
      return;
    }catch(err){
      if(attempt===23){
        $('agentStatus').textContent='Partial';
        $('agentDetail').textContent='Status polling timed out; the Agent run may still be finishing in TinyFish.';
        $('agentSub').textContent='pending';
        statusBox.className='status error';
        statusBox.textContent='Agent is taking longer than expected. Do not start a second run immediately; wait, then run the audit once more if needed.';
      }
    }
  }
  $('agentStatus').textContent='Partial';
  $('agentDetail').textContent='Agent did not reach a terminal state in the expected time.';
  $('agentSub').textContent='pending';
  statusBox.className='status error';
  statusBox.textContent='Search + Fetch completed. The Agent check exceeded the expected time; wait briefly and rerun once. The app will not stay stuck indefinitely.';
  $('apiKey').value='';
}

$('auditForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const url=$('url').value.trim(),query=$('query').value.trim(),apiKey=$('apiKey').value.trim();
 const status=$('status'),btn=$('runBtn');
 btn.disabled=true;btn.textContent='Starting live audit…';status.className='status';status.textContent='Running TinyFish Fetch + Search and starting the Agent browser check…';$('results').classList.add('hidden');
 try{
   const r=await fetch('/api/audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,query,apiKey})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Audit failed');

   $('score').textContent=d.score+'/100';$('grade').textContent=d.grade;
   $('queryUsed').textContent='Query: '+d.queryUsed+(d.queryInferred?' (inferred from page)':'');
   $('titleMetric').textContent=d.titleLength?d.titleLength+' chars':'Missing';
   $('descMetric').textContent=d.descriptionLength?d.descriptionLength+' chars':'Missing';
   $('h1Metric').textContent=d.h1Count;$('linksMetric').textContent=d.linkCount;$('imagesMetric').textContent=d.imageCount;$('wordsMetric').textContent=d.wordCount;

   $('searchStatus').textContent=endpointState(d.search?.ok,false,false);
   $('searchDetail').textContent=d.search?.ok?(d.search.found?'Target visible at #'+d.search.bestPosition:'Target not found in returned results'):(d.search?.error||'Search unavailable');
   $('searchSub').textContent=d.subscores.search+'/100';

   $('fetchStatus').textContent=endpointState(d.fetch?.ok,false,false);
   $('fetchDetail').textContent=d.fetch?.ok?('Extracted '+d.wordCount+' words · '+d.h1Count+' H1'):d.fetch?.error||'Fetch unavailable';
   $('fetchSub').textContent=d.subscores.fetch+'/100';

   $('agentStatus').textContent=endpointState(d.agent?.ok,d.agent?.partial,d.agent?.running);
   $('agentDetail').textContent=d.agent?.running?'Browser-readability check started':d.agent?.ok?(d.agent.summary||'Browser readability analyzed'):(d.agent?.error||'Agent unavailable');
   $('agentSub').textContent=d.agent?.running?'pending':d.subscores.agent+'/100';

   renderIssues(d.issues||[]);renderSnapshot(d);
   $('visibilityCompare').textContent=d.visibilityComparison||'No comparison available.';
   renderList('canRead',d.canRead,'No positive readability signals returned.');
   renderList('mayMiss',d.mayMiss,'No major browser-only gaps detected.');
   $('results').classList.remove('hidden');

   if(d.agent?.running){
     await pollAgent(d,apiKey);
   }else{
     status.classList.add('hidden');
     $('apiKey').value='';
   }
 }catch(err){
   status.className='status error';status.textContent=err.message;$('apiKey').value='';
 }finally{
   btn.disabled=false;btn.textContent='Run 3-endpoint audit';
 }
});