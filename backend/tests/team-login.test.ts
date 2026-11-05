import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.ts';
import type { Config } from '../src/security.ts';

const userId='10000000-0000-4000-8000-000000000001';
const sessionId='20000000-0000-4000-8000-000000000001';
const token=`synthetic.${Buffer.from(JSON.stringify({sub:userId,session_id:sessionId})).toString('base64url')}.synthetic`;
const config:Config={origin:'https://challenge.example',supabaseUrl:'https://database.example',anonKey:'synthetic-public-key-only',serviceKey:'synthetic-private-key-only',secret:'ab'.repeat(32),production:true,aiMode:'disabled',aiDailyLimit:15,aiGlobalDailyLimit:100,captchaConfigured:false};
function request() {return new Request(config.origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json','X-Requested-With':'grandaptive'},body:JSON.stringify({email:'demo@example.com',password:'synthetic-password'})});}
test('login sin CAPTCHA permanece cerrado salvo habilitación explícita de demo',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected network');});
  assert.equal((await handleRequest(request(),config)).status,503);
  const options=await handleRequest(new Request(config.origin+'/api/v1/auth/options'),config);
  assert.deepEqual(await options.json(),{mode:'closed',publicEnrollment:false});
});
for(const member of [true,false]) test(`demo sin CAPTCHA verifica membresía administrativa (${member}) antes de emitir cookies`,async t=>{
  let signedOut=false;let limits=0;
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.includes('/rpc/consume_rate_limit')){limits++;return Response.json(true);}
    if(url.includes('/auth/v1/token')){assert.equal(limits,2);return Response.json({access_token:token,refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user:{id:userId,email:'demo@example.com',app_metadata:{challenge_member:member}}});}
    if(url.includes('/auth/v1/user'))return Response.json({id:userId,app_metadata:{challenge_member:member}});
    if(url.includes('/rpc/assert_live_session'))return Response.json(true);
    if(url.includes('/auth/v1/logout')){assert.equal(init?.method,'POST');signedOut=true;return new Response(null,{status:204});}
    throw new Error('Unexpected network');
  });
  const response=await handleRequest(request(),{...config,teamDemoLogin:true});
  assert.equal(response.status,member?200:403);
  assert.equal(response.headers.has('set-cookie'),member);
  if(member){assert.match(response.headers.get('set-cookie')!,/HttpOnly/);assert.match(response.headers.get('set-cookie')!,/Secure/);}
  assert.equal(signedOut,!member);
});
test('demo conserva rate limit y CAPTCHA configurado tiene prioridad sobre la excepción',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(false);});
  assert.equal((await handleRequest(request(),{...config,teamDemoLogin:true})).status,429);
  assert.equal(calls,1);
  assert.equal((await handleRequest(request(),{...config,teamDemoLogin:true,captchaConfigured:true})).status,422);
  assert.equal(calls,1);
});
