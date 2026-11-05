// Local browser-test fixture. No Supabase, OpenAI, credentials or real user data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

export async function fixtureServer() {
  const root=fileURLToPath(new URL('../../dist/',import.meta.url));
  const user='10000000-0000-4000-8000-000000000001';
  const stamp='2026-11-05T10:00:00Z';let sequence=10;
  const id=()=>`30000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;
  const state={authenticated:false,failSave:false,calls:[],consents:{aiEnabled:false,conversation:false,patterns:false,profileMemory:false,authorizationRevision:0},settings:{tone:'neutral',length:'brief',listenOnly:true,followUp:false,questionStyle:'direct',useExamples:false,literalLanguage:true,modality:'text',settingsRevision:0},ui:{textScale:100,contrast:'standard',density:'comfortable',reducedMotion:true,notifications:false,startSection:'diary'},entries:[{id:id(),text:'Después de una reunión con ruido, pedí las instrucciones por escrito y descansé. Relato ficticio.',version:1,availableForAnalysis:true,createdAt:stamp,updatedAt:stamp}],profile:[],readings:[],receipts:new Map()};
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      if(!url.pathname.startsWith('/api/v1/')){
        const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
        if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
        const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'application/octet-stream';
        res.writeHead(200,{'Content-Type':mime});res.end(await readFile(file));return;
      }
      const path=url.pathname.slice('/api/v1'.length);let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
      state.calls.push({path,method:req.method,body});
      const reply=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
      if(path==='/auth/options')return reply({mode:'team-demo',publicEnrollment:false});
      if(path==='/auth/login'){state.authenticated=true;return reply({user:{id:user}});}
      if(!state.authenticated)return reply({error:{code:'AUTH_REQUIRED',message:'Inicia sesión.'}},401);
      if(path==='/auth/session')return reply({user:{id:user}});
      if(path==='/auth/refresh')return reply({refreshed:true});
      if(path==='/auth/logout'){state.authenticated=false;return reply({loggedOut:true});}
      if(path==='/consents'){if(req.method==='PATCH')state.consents={aiEnabled:body.aiEnabled,conversation:body.conversation,patterns:body.patterns,profileMemory:body.profileMemory,authorizationRevision:state.consents.authorizationRevision+1};return reply(state.consents);}
      if(path==='/settings'){if(req.method==='PATCH')state.settings={...body.settings,settingsRevision:state.settings.settingsRevision+1};return reply({settings:state.settings});}
      if(path==='/settings/preview')return reply({content:{type:'accompany',text:'Ejemplo simulado: puedes dejarlo registrado.',questions:[],recommendations:[]},simulation:true});
      if(path==='/interface-settings'){if(req.method==='PATCH')state.ui=body;return reply({settings:state.ui});}
      if(path==='/entries/search')return reply({entries:state.entries.filter(x=>x.text.includes(body.q))});
      if(path==='/entries'){
        if(req.method==='POST'){if(state.failSave)return reply({error:{code:'DATABASE_UNAVAILABLE',message:'No se pudo guardar. Tu borrador se conserva.'}},503);const entry={id:id(),text:body.text,version:1,availableForAnalysis:body.availableForAnalysis??false,createdAt:stamp,updatedAt:stamp};state.entries.unshift(entry);return reply({entry},201);}
        return reply({entries:state.entries});
      }
      const match=path.match(/^\/entries\/([^/]+)(\/deletion-plan)?$/);
      if(match){const entry=state.entries.find(x=>x.id===match[1]);if(match[2])return reply({entryId:entry.id,profileItems:[],interpretationIds:state.readings.filter(x=>x.entry_id===entry.id).map(x=>x.id)});if(req.method==='PATCH'){Object.assign(entry,{...body,version:entry.version+1,updatedAt:stamp});if(body.availableForAnalysis!==undefined)entry.availableForAnalysis=body.availableForAnalysis;return reply({entry});}if(req.method==='DELETE'){state.entries=state.entries.filter(x=>x.id!==entry.id);state.readings=state.readings.filter(x=>x.entry_id!==entry.id);return reply({deleted:true});}return reply({entry});}
      if(path==='/profile'){if(req.method==='POST'){const item={id:id(),...body,origin:'user',status:'accepted',created_at:stamp,profile_item_sources:[]};state.profile.push(item);return reply({item},201);}return reply({items:state.profile});}
      if(path.startsWith('/profile/')){const item=state.profile.find(x=>x.id===path.split('/')[2]);if(req.method==='PATCH'){Object.assign(item,body);return reply({item});}state.profile=state.profile.filter(x=>x!==item);return reply({deleted:true});}
      if(path==='/conversations')return reply({conversation:{id:id(),entry_id:body.entryId,safety_state:'normal'}},201);
      if(path.endsWith('/pause'))return reply({paused:true,specialistProtocol:'pending'});
      if(path==='/ai/operations'){
        const contents={accompany:{type:'accompany',text:'Ejemplo simulado. Tu registro queda conservado; puedes dejarlo aquí.',questions:[],recommendations:[]},summary:{type:'summary',text:'Resumen simulado de una reunión y un descanso.'},interpret:{type:'interpret',reportedFacts:['Se describió una reunión con ruido.'],possibleReadings:['Podría haber influido el entorno.','También podría haber otros factores.'],unknowns:['No sabemos lo que pensaban otras personas.'],abstentionReason:null},communicate:{type:'communicate',formulations:['Me ayudaría recibir las instrucciones por escrito.','Prefiero revisar las indicaciones por escrito antes de continuar.']},pattern:{type:'pattern',hypothesis:'Podría ser útil revisar si las instrucciones escritas te ayudan en algunos contextos.',category:'communication',patternKey:'written-instructions'}};
        const result={schemaVersion:'0.1',requestId:id(),simulation:true,content:contents[body.operation],context:{sources:body.entryIds.map(entryId=>({entryId,entryVersion:state.entries.find(x=>x.id===entryId).version})),profileItemIds:[]},receipt:'synthetic-receipt-'+id(),expiresAt:Date.now()+600000};state.receipts.set(result.receipt,result);return reply(result);
      }
      if(path==='/interpretations'){
        if(req.method==='POST'){const source=state.receipts.get(body.receipt);const item={id:id(),entry_id:source.context.sources[0].entryId,entry_version:source.context.sources[0].entryVersion,content:source.content,simulation:true,created_at:stamp,rejected_readings:[]};state.readings.push(item);return reply({id:item.id},201);}
        return reply({interpretations:state.readings.filter(x=>x.entry_id===url.searchParams.get('entryId')).map(x=>({...x,basedOnPreviousVersion:x.entry_version!==state.entries.find(e=>e.id===x.entry_id)?.version}))});
      }
      if(path.includes('/readings/')){const item=state.readings.find(x=>x.id===path.split('/')[2]);item.rejected_readings.push(Number(path.split('/')[4]));return reply({interpretation:item});}
      if(path.startsWith('/interpretations/')){state.readings=state.readings.filter(x=>x.id!==path.split('/')[2]);return reply({deleted:true});}
      if(path==='/suggestions'){const source=state.receipts.get(body.receipt);const item={id:id(),text:source.content.hypothesis,category:source.content.category,origin:'ai',simulation:true,status:'pending',created_at:stamp,profile_item_sources:source.context.sources.map(x=>({entry_id:x.entryId,entry_version:x.entryVersion}))};state.profile.push(item);return reply({id:item.id},201);}
      if(path.startsWith('/suggestions/')){const item=state.profile.find(x=>x.id===path.split('/')[2]);item.status={accept:'accepted',edit:'accepted',reject:'rejected',archive:'archived'}[body.decision];if(body.text)item.text=body.text;return reply({updated:true});}
      if(path==='/account'){state.authenticated=false;return reply({deletedFromActiveDatabase:true});}
      if(path==='/export'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('DATOS FICTICIOS');return;}
      return reply({error:{code:'NOT_FOUND',message:'Fixture no configurado.'}},404);
    }catch{res.writeHead(500);res.end('Fixture error');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {state,server,url:`http://127.0.0.1:${server.address().port}`};
}
