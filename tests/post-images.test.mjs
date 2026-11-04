import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { catalogEntries, imageCandidates, parseImageDecision, readPublic, decodeImage, uploadPostImage, validPostImage, PostImages, cosAuthorization } from '../lib/post-images.js';
import { postBody } from '../lib/post-format.js';
import { decisionMessages } from '../lib/generator.js';

const catalog = {gallery:{fish:{name:'DeepSeek娘',images:[
  {alt:'下班瘫家玩手机快乐摸鱼',original:'https://img.aigengtu.com/meme/060.webp',story:{zh:'下班到家放空，在沙发上摸鱼休息。',contributor:'示例作者'}},
  {alt:'游戏终于通关了庆祝胜利',original:'https://img.aigengtu.com/meme/123.png',story:{zh:'游戏通关，开心庆祝。'}},
  {alt:'辱骂你妈',original:'https://img.aigengtu.com/meme/005.jpg'},
  {alt:'下班放空',original:'https://evil.example/meme/001.png'},
  {alt:'下班动图',original:'https://img.aigengtu.com/meme/002.gif'},
]}}};
const signal = () => new AbortController().signal;
const pixels = () => sharp({create:{width:8,height:6,channels:4,background:'#abc'}}).png().toBuffer();
const response = value => new Response(JSON.stringify(value));
const uploaded = {url:'https://imgheybox.max-c.com/bbs/image.png',width:8,height:6};

test('catalog limits sources, excludes unsuitable images and retrieves context without repeating recent images',()=>{
  const entries=catalogEntries(catalog);
  assert.equal(entries.length,2);
  assert.equal(entries[0].sourceUrl,'https://aigengtu.com/zh/meme/060');
  assert.equal(imageCandidates(entries,'下班了','到家后只想在沙发上摸鱼休息')[0].id,'060');
  assert.equal(imageCandidates(entries,'下班了','到家后只想在沙发上摸鱼休息',['060']).length,0);
  assert.equal(imageCandidates(entries,'量子力学','波函数测量问题').length,0);
  assert.throws(()=>catalogEntries({}));
});

test('selection parser only accepts a bounded ID/reason and the model is told to skip mismatches',()=>{
  assert.deepEqual(parseImageDecision('{"action":"skip"}'),{action:'skip'});
  for(const value of [{action:'select',id:'https://evil.example',reason:'bad'},{action:'select',id:'060',reason:''},{action:'select',id:'060',reason:'<script>'}]) assert.throws(()=>parseImageDecision(JSON.stringify(value)));
  const prompt=decisionMessages({kind:'post-image'},{});
  assert.ok(prompt[0].content.includes('没有向你提供图片像素'));
  assert.ok(prompt[0].content.includes('最多选1张'));
});

test('public downloads do not send cookies, deny redirects and enforce streaming byte limits',async()=>{
  let options;
  const data=await readPublic('https://img.aigengtu.com/meme/060.webp',{signal:signal(),maxBytes:10,fetcher:async(url,opts)=>{options=opts;return new Response('abc');}});
  assert.equal(data.toString(),'abc');assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{Accept:'*/*'});
  await assert.rejects(readPublic('https://aigengtu.com/gallery-index.json',{signal:signal(),maxBytes:2,fetcher:async()=>new Response('abc')}),/过大/);
  await assert.rejects(readPublic('https://aigengtu.com/gallery-index.json',{signal:signal(),maxBytes:10,fetcher:async()=>new Response('abc',{status:403})}),/不可用/);
});

test('image decoding validates actual pixels, dimensions and format',async()=>{
  const decoded=await decodeImage(await pixels());
  assert.equal(decoded.width,8);assert.equal(decoded.height,6);
  assert.equal((await sharp(decoded.buffer).metadata()).format,'png');
  await assert.rejects(decodeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>')),/静态图片/);
  await assert.rejects(decodeImage(Buffer.from('not an image')));
  const buffer=await pixels();await assert.rejects(decodeImage(buffer.subarray(0,40)));
});

function uploadFixture(patch={}) {
  const calls=[],requests=[];
  const api=async(account,path,params,method,form)=>{
    calls.push({account,path,params,method,form});
    if(path.includes('/info/'))return {result:{keys:['/bbs/image.png'],bucket:'heybox-12345',region:'ap-shanghai',host:'imgheybox.max-c.com',...patch}};
    if(path.includes('/token/'))return {result:{credentials:{tmpSecretId:'temporary-id',tmpSecretKey:'temporary-secret',sessionToken:'temporary-token'},startTime:1700000000,expiredTime:1700000600}};
    return {result:{}};
  };
  const fetcher=async(url,options)=>{requests.push({url,options});return new Response('');};
  return {calls,requests,api,fetcher};
}

test('upload uses authenticated platform endpoints and only temporary COS credentials for bytes',async()=>{
  const f=uploadFixture();
  const image=await decodeImage(await pixels());
  const result=await uploadPostImage(image,{...f,account:{cookie:'private-cookie'},signal:signal()});
  assert.deepEqual(result,uploaded);
  assert.equal(f.calls.length,3);
  assert.ok(f.calls.every(c=>c.method==='POST' && c.params.web_version==='3.0'));
  assert.equal(f.requests.length,1);const r=f.requests[0];
  assert.equal(r.url,'https://heybox-12345.cos.ap-shanghai.myqcloud.com/bbs/image.png');
  assert.equal(r.options.method,'PUT');assert.equal(r.options.redirect,'error');
  assert.equal(r.options.headers.Cookie,undefined);
  assert.equal(r.options.headers['x-cos-security-token'],'temporary-token');
  assert.ok(!JSON.stringify(result).includes('temporary'));
  assert.equal(JSON.parse(f.calls[0].form.file_infos)[0].width,8);
  assert.equal(JSON.parse(f.calls[1].form.keys).length,1);
});

test('invalid upload destinations and cancellations cannot cause an external upload',async()=>{
  for(const patch of [{host:'evil.example'},{bucket:'evil.example/path'},{keys:['/../secret']},{region:'../../bad'}]){
    const f=uploadFixture(patch);await assert.rejects(uploadPostImage({buffer:Buffer.from('x'),width:8,height:6},{...f,account:{},signal:signal()}));assert.equal(f.requests.length,0);
  }
  const f=uploadFixture();await assert.rejects(uploadPostImage({},{...f,account:{},signal:signal(),current:()=>false}));assert.equal(f.calls.length,0);
  assert.equal(validPostImage({...uploaded,url:'https://imgheybox.max-c.com.evil.example/x.png'}),false);
  assert.equal(validPostImage({...uploaded,width:99999}),false);
  assert.equal(validPostImage({...uploaded,url:'https://user:pw@imgheybox.max-c.com/x.png'}),false);
});

test('image payload works in plain and article modes, never treats a source URL as an uploaded image',()=>{
  const plain=JSON.parse(postBody('正文','plain',uploaded).text);
  assert.equal(plain[1].type,'img');assert.equal(plain[1].url,uploaded.url);
  const rich=JSON.parse(postBody('**重点**','rich',uploaded).text)[0];
  assert.ok(rich.text.includes('<strong>重点</strong>'));assert.ok(rich.text.includes('<img src="https://imgheybox.max-c.com/bbs/image.png" width="8" height="6">'));
  assert.throws(()=>postBody('正文','rich',{...uploaded,url:'https://img.aigengtu.com/meme/060.webp'}));
});

test('image preparation persists upload intent, handles skip/failure and never reuploads an interrupted intent',async()=>{
  const raw=await pixels();let saves=0,generateCount=0,putCount=0;
  const f=uploadFixture();const job={imageEnabled:true,title:'下班了',text:'到家在沙发摸鱼休息'};
  const w={data:{config:{}},controller:new AbortController(),now:()=>1,directory:'/tmp',save:()=>{saves++;},accountState:()=>({posting:{jobs:[job]}}),api:f.api,
    generate:async input=>{generateCount++;assert.equal(input.kind,'post-image');assert.equal(input.candidates[0].url,undefined);return {action:'select',id:'060',reason:'正文和图片都是下班休息'};},
    imageFetch:async(url,options)=>{if(url.endsWith('gallery-index.json'))return response(catalog);if(options.method==='PUT'){assert.equal(job.image.status,'uploading');putCount++;return new Response('');}return new Response(raw);}};
  const service=new PostImages(w);await service.prepare(job,{},()=>true);
  assert.equal(job.image.status,'uploaded');assert.equal(job.image.reason,'正文和图片都是下班休息');assert.ok(saves>=3);
  await service.prepare(job,{},()=>true);assert.equal(generateCount,1);assert.equal(putCount,1);
  job.image={status:'uploading'};await service.prepare(job,{},()=>true);assert.equal(job.image.status,'failed');assert.equal(putCount,1);
  job.image=undefined;w.generate=async()=>({action:'select',id:'999',reason:'invented'});await service.prepare(job,{},()=>true);assert.equal(job.image.status,'failed');assert.equal(putCount,1);
  job.image=undefined;w.generate=async()=>({action:'skip'});await service.prepare(job,{},()=>true);assert.equal(job.image.status,'skipped');assert.equal(putCount,1);
  job.image=undefined;w.generate=async()=>{throw new Error('private credential');};await service.prepare(job,{},()=>true);assert.equal(job.image.status,'failed');assert.ok(!JSON.stringify(job).includes('private credential'));
});
