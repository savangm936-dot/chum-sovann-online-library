// ASSET_BUNDLE
// SEED_DATA
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
class Failure extends Error { constructor(status,message){super(message);this.status=status} }
function demand(ok,status,msg){if(!ok)throw new Failure(status,msg)}
function str(v,max,needed=false){demand(typeof v==='string'&&v.length<=max&&(!needed||v.trim()),400,'សូមពិនិត្យព័ត៌មានដែលបានបញ្ចូល។');return v.trim()}
function number(v,min,max){demand(Number.isSafeInteger(v)&&v>=min&&v<=max,400,'ចំនួនមិនត្រឹមត្រូវ។');return v}
function currency(v){demand(['USD','KHR'].includes(v),400,'សូមជ្រើសរូបិយប័ណ្ណ។');return v}
function picture(v,max){
 if(!v)return '';
 demand(typeof v==='string'&&v.length<=max,413,'រូបភាពធំពេក។');
 const m=v.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);demand(m&&m[2].length%4===0,400,'សូមជ្រើស PNG, JPG ឬ WebP។');
 const head=atob(m[2].slice(0,24));
 demand(m[1]==='png'?head.startsWith('\x89PNG\r\n\x1a\n'):m[1]==='jpeg'?head.startsWith('\xff\xd8\xff'):head.startsWith('RIFF')&&head.slice(8,12)==='WEBP',400,'រូបភាពមិនត្រឹមត្រូវ។');return v;
}
function itemImage(v){if(!v)return '';if(v.startsWith('data:'))return picture(v,1100000);if(/^\/assets\/[A-Za-z0-9_.-]+$/.test(v))return v;const u=new URL(v);demand(u.protocol==='https:'&&!u.username&&!u.password,400,'តំណរូបភាពមិនត្រឹមត្រូវ។');return u.href}
function media(value){const [prefix,data]=value.split(',');return new Response(Uint8Array.from(atob(data),c=>c.charCodeAt(0)),{headers:{'content-type':prefix.slice(5,-7),'cache-control':'private, no-store','x-content-type-options':'nosniff'}})}
async function body(req){
 demand(req.headers.get('content-type')?.startsWith('application/json'),415,'JSON required');
 demand(req.headers.get('origin')===new URL(req.url).origin,403,'Origin mismatch');
 const reader=req.body?.getReader();demand(reader,400,'Invalid request');const chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1300000){await reader.cancel();throw new Failure(413,'រូបភាពធំពេក។')}chunks.push(value)}
 try{return JSON.parse(await new Blob(chunks).text())}catch{throw new Failure(400,'Invalid JSON')}
}
let seedReady;
async function init(db){
 if(await db.prepare("SELECT id FROM setup WHERE id=1").first())return;
 const statements=SEED.items.map(i=>db.prepare('INSERT OR IGNORE INTO items(id,kind,title,image,price_usd,price_khr,description,level,active) VALUES (?,?,?,?,?,?,?,?,?)').bind(...i));
 for(const p of SEED.pages)statements.push(db.prepare('INSERT OR IGNORE INTO pages(id,book,title,body,basic) VALUES (?,?,?,?,?)').bind(...p));
 statements.push(db.prepare('INSERT OR IGNORE INTO setup(id) VALUES (1)'));await db.batch(statements)
}
const publicItems="SELECT id,kind,title,CASE WHEN image LIKE 'data:%' THEN '/api/image?id='||id ELSE image END image,price_usd,price_khr,description,level,active FROM items";
const orderList='SELECT o.*,i.title FROM orders o JOIN items i ON i.id=o.item_id';
const grantList='SELECT g.*,i.title,i.kind FROM grants g JOIN items i ON i.id=g.item_id';
const requests='SELECT id,user_id,currency,amount,reference,status,bank_ref,created,reviewed_by, CASE WHEN length(receipt)>0 THEN 1 ELSE 0 END has_receipt FROM topups';
async function handle(req,env,url){
 const db=env.DB;demand(db,503,'មូលដ្ឋានទិន្នន័យមិនទាន់ភ្ជាប់។');
 seedReady??=init(db).catch(e=>{seedReady=null;throw e});await seedReady;
 const path=url.pathname;
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const one=(sql,...a)=>stmt(sql,...a).first();
 const rows=async(sql,...a)=>(await stmt(sql,...a).all()).results;
 const run=(sql,...a)=>stmt(sql,...a).run();
 const post=req.method==='POST';demand(post||req.method==='GET',405,'Method not allowed');
 const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
 const owner=!!(id&&email&&env.OWNER_EMAIL&&email.toLowerCase()===env.OWNER_EMAIL.toLowerCase());
 if(!post&&path==='/api/catalog')return json({items:await rows(publicItems+' WHERE active=1 ORDER BY rowid'),pages:await rows('SELECT p.id,p.book,p.title,p.basic FROM pages p JOIN items i ON i.id=p.book WHERE i.active=1 ORDER BY p.rowid'),ai:!!env.OPENAI_API_KEY});
 if(!post&&path==='/api/image'){const row=await one('SELECT image FROM items WHERE id=? AND (active=1 OR ?=1)',url.searchParams.get('id'),+owner);demand(row?.image?.startsWith('data:'),404,'មិនមានរូបភាព។');return media(row.image)}
 if(!id||!email){if(path==='/api/me'&&!post)return json({user:null,topups:[],orders:[],grants:[]});throw new Failure(401,'សូមចូលគណនីសិន។')}
 let user=await one('SELECT * FROM users WHERE id=?',id);
 if(!user){await run('INSERT OR IGNORE INTO users(id,name) VALUES (?,?)',id,email.split('@')[0].slice(0,64));user=await one('SELECT * FROM users WHERE id=?',id)}
 demand(user&&!user.disabled,403,'គណនីត្រូវបានផ្អាក។');
 if(path.startsWith('/api/admin')||path==='/api/receipt')demand(owner,403,'សម្រាប់ម្ចាស់វេបសាយ។');
 const b=post?await body(req):{};demand(b&&typeof b==='object'&&!Array.isArray(b),400,'Invalid data');
 if(path==='/api/me'&&!post){
 const bal=await one("SELECT coalesce(sum(CASE WHEN currency='USD' THEN delta END),0) usd,coalesce(sum(CASE WHEN currency='KHR' THEN delta END),0) khr FROM ledger WHERE user_id=?",id);
 return json({user:{...user,...bal,admin:owner},topups:await rows(requests+' WHERE user_id=? ORDER BY created DESC',id),orders:await rows(orderList+' WHERE o.user_id=? ORDER BY o.created DESC',id),grants:await rows(grantList+' WHERE g.user_id=?',id)})}
 if(path==='/api/profile'&&post){await run('UPDATE users SET name=? WHERE id=?',str(b.name,64,true),id);return json({ok:true})}
 if(path==='/api/topups'&&post){
 const amount=number(b.amount,1,1000000000),ref=str(b.reference||'',120),receipt=picture(b.receipt,1170000);
 demand(ref||receipt,400,'សូមដាក់លេខយោង ឬរូបបង្កាន់ដៃ។');
 const tid=crypto.randomUUID();await run('INSERT INTO topups(id,user_id,currency,amount,reference,receipt) VALUES(?,?,?,?,?,?)',tid,id,currency(b.currency),amount,ref,receipt);return json({id:tid,status:'pending'},201)}
 if(path==='/api/buy'&&post){
 const key=str(b.key,80,true),item=str(b.id,80,true),cur=currency(b.currency);
 const prior=()=>one('SELECT * FROM orders WHERE id=?',key);
 const match=p=>{demand(p.user_id===id&&p.item_id===item&&p.currency===cur,409,'លេខសំណើបានប្រើរួច។');return json({ok:true,id:key})};
 let old=await prior();if(old)return match(old);
 const product=await one('SELECT * FROM items WHERE id=? AND active=1',item);demand(product,404,'ទំនិញមិនមានសម្រាប់ទិញ។');
 demand(b.quote===(cur==='USD'?product.price_usd:product.price_khr),409,'តម្លៃបានផ្លាស់ប្តូរ។ សូមបើកទំព័រទិញម្ដងទៀត។');
 try{await run('INSERT INTO orders(id,user_id,item_id,currency,amount) VALUES(?,?,?,?,?)',key,id,item,cur,cur==='USD'?product.price_usd:product.price_khr)}catch(error){old=await prior();if(old)return match(old);throw error}return json({ok:true,id:key},201)}
 if(path==='/api/class-access'&&!post){const grant=await one("SELECT 1 FROM grants g JOIN items i ON i.id=g.item_id WHERE g.user_id=? AND g.active=1 AND (g.expires IS NULL OR g.expires>unixepoch()) AND i.kind IN ('vip','lifetime')",id);demand(owner||grant,403,'ត្រូវការសិទ្ធិ VIP។');return json({ok:true})}
 if(path==='/api/read'&&!post){
 const page=await one(`SELECT p.title,p.body FROM pages p JOIN items book ON book.id=p.book
 WHERE p.id=? AND ( ?=1 OR (book.active=1 AND EXISTS (SELECT 1 FROM grants g JOIN items plan ON plan.id=g.item_id WHERE g.user_id=? AND g.active=1 AND (g.expires IS NULL OR g.expires>unixepoch()) AND (g.item_id=p.book OR plan.kind IN ('vip','lifetime') OR (plan.kind='basic' AND p.basic=1)))))`,url.searchParams.get('id'),+owner,id);
 demand(page,403,'សូមពិនិត្យសមាជិកភាព ឬសិទ្ធិអានទំព័រនេះ។');return json(page)}
 if(path==='/api/admin'&&!post)return json({items:await rows(publicItems.replace("CASE WHEN image LIKE 'data:%' THEN '/api/image?id='||id ELSE image END image","CASE WHEN image LIKE 'data:%' THEN '/api/image?id='||id ELSE image END image")),pages:await rows('SELECT * FROM pages ORDER BY rowid'),users:await rows('SELECT * FROM users'),topups:await rows(requests+' ORDER BY created DESC'),orders:await rows(orderList+' ORDER BY created DESC'),grants:await rows(grantList)});
 if(path==='/api/receipt'&&!post){const row=await one('SELECT receipt FROM topups WHERE id=?',url.searchParams.get('id'));demand(row?.receipt,404,'មិនមានរូបបង្កាន់ដៃ។');return media(row.receipt)}
 if(path==='/api/admin/review'&&post){
 demand(['approve','reject'].includes(b.decision),400,'Invalid decision');
 const approve=b.decision==='approve';if(approve)demand(b.confirmed===true,400,'សូមពិនិត្យប្រាក់ចូលពិតក្នុង ABA។');
 const bank=approve?str(b.bank_ref,120,true).toUpperCase():null;
 const result=await run("UPDATE topups SET status=?, reviewed_by=?,bank_ref=? WHERE id=? AND status='pending'",approve?'approved':'rejected',id,bank,str(b.id,80,true));demand(result.meta.changes>0,409,'សំណើត្រូវបានពិនិត្យរួច។');return json({ok:true})}
 if(path==='/api/admin/item'&&post){
 const key=str(b.id,80,true);demand(/^[A-Za-z0-9_-]+$/.test(key),400,'Invalid ID');demand(['book','goods','basic','vip','lifetime'].includes(b.kind),400,'Invalid kind');
 const current=await one('SELECT image FROM items WHERE id=?',key);const img=current&&b.image==='/api/image?id='+key?current.image:itemImage(b.image||'');
 await run('INSERT INTO items(id,kind,title,image,price_usd,price_khr,description,level,active) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,image=excluded.image,price_usd=excluded.price_usd,price_khr=excluded.price_khr,description=excluded.description,level=excluded.level,active=excluded.active',key,b.kind,str(b.title,180,true),img,number(b.price_usd,0,1e9),number(b.price_khr,0,1e9),str(b.description||'',1500),str(b.level||'',64),number(b.active,0,1));return json({ok:true})}
 if(path==='/api/admin/page'&&post){await run('INSERT INTO pages(id,book,title,body,basic) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET book=excluded.book,title=excluded.title,body=excluded.body,basic=excluded.basic',str(b.id,80,true),str(b.book,80,true),str(b.title,180,true),str(b.body,100000,true),number(b.basic,0,1));return json({ok:true})}
 if(path==='/api/admin/user'&&post){demand(b.id!==id||!b.disabled,400,'មិនអាចផ្អាកគណនីម្ចាស់បានទេ។');const r=await run('UPDATE users SET name=?,disabled=? WHERE id=?',str(b.name,64,true),number(b.disabled,0,1),str(b.id,160,true));demand(r.meta.changes,404,'រកមិនឃើញគណនី។');return json({ok:true})}
 if(path==='/api/admin/access'&&post){const it=await one('SELECT kind FROM items WHERE id=?',str(b.item_id,80,true));demand(it&&it.kind!=='goods',400,'សូមជ្រើសសៀវភៅ ឬគម្រោង។');demand(!['vip','basic'].includes(it.kind)||b.expires!=null,400,'ត្រូវកំណត់ថ្ងៃផុតកំណត់។');
 await run('INSERT INTO grants(user_id,item_id,expires,active) VALUES(?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET expires=excluded.expires,active=excluded.active',str(b.user_id,160,true),b.item_id,b.expires==null?null:number(b.expires,1,9999999999),number(b.active,0,1));return json({ok:true})}
 if(path==='/api/ai'&&post){
 demand(env.OPENAI_API_KEY,503,'AI រង់ចាំភ្ជាប់ API Key។');demand(['chat','translate','image'].includes(b.mode),400,'Invalid mode');const prompt=str(b.prompt,3000,true);
 const cost=b.mode==='image'?10:1;const quota=await run("INSERT INTO ai_usage(user_id,day,n) VALUES(?,date('now'),?) ON CONFLICT(user_id,day) DO UPDATE SET n=n+excluded.n WHERE n+excluded.n<=30",id,cost);
 demand(quota.meta.changes,429,'បានដល់កំណត់ប្រើ AI ប្រចាំថ្ងៃ។');
 const image=b.mode==='image';
 const params=image?{model:'gpt-image-1',prompt,size:'1024x1024',quality:'low'}:{model:'gpt-4o-mini',max_tokens:800,messages:[{role:'system',content:b.mode==='translate'?'Translate Khmer into Japanese or Japanese into Khmer. Provide readings when useful.':'You are Sovann Library Japanese tutor. Reply in Khmer unless requested otherwise.'},{role:'user',content:prompt}]};
 const upstream=await fetch('https://api.openai.com/v1/'+(image?'images/generations':'chat/completions'),{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(params)});
 demand(upstream.ok,502,'សេវា AI មិនអាចឆ្លើយនៅពេលនេះ។');const res=await upstream.json();const out=image?res.data?.[0]?.b64_json:res.choices?.[0]?.message?.content;demand(out,502,'សេវា AI មិនបានផ្ដល់លទ្ធផល។');return json(image?{image:'data:image/png;base64,'+out}:{text:out})}
 throw new Failure(404,'រកមិនឃើញទំព័រ។');
}
const routes=new Set(['/','/books','/book','/read','/dictionary','/shop','/wallet','/top-up','/membership','/account','/ai','/checkout','/cart','/admin']);
export default { async fetch(req,env){
 const url=new URL(req.url);try{
 if(url.pathname.startsWith('/api/'))return await handle(req,env,url);
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('',{status:405});
 if(url.pathname.startsWith('/classroom')){try{await handle(req,env,new URL('/api/class-access',url))}catch(error){if(error.status===401)return Response.redirect(url.origin+'/signin-with-chatgpt?return_to=%2Fclassroom%2F',302);if(error.status===403)return Response.redirect(url.origin+'/membership',302);throw error}}
 if(url.pathname==='/classroom')return Response.redirect(url.origin+'/classroom/',302);
 const path=routes.has(url.pathname)?(url.pathname==='/admin'?'/admin.html':'/shell.html'):url.pathname==='/classroom/'?'/classroom/index.html':url.pathname;
 const asset=ASSETS[path];if(!asset)return new Response('404',{status:404});
 return new Response(req.method==='HEAD'?null:Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)),{headers:{'content-type':asset[0],'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self' "+(path.startsWith('/classroom/')?"'unsafe-inline' ":"")+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"}});
 }catch(e){const m=String(e?.message);const errors=[['insufficient','Credit មិនគ្រប់គ្រាន់។'],['already_owned','អ្នកមានសិទ្ធិនេះរួចហើយ។'],['basic_page_limit','គម្រោងធម្មតាអាចជ្រើសបានច្រើនបំផុត ៤ ទំព័រ។'],['UNIQUE','លេខយោង ឬទិន្នន័យនេះបានប្រើរួច។'],['CONSTRAINT','ទិន្នន័យមិនត្រូវនឹងលក្ខខណ្ឌ។'],['item_kind_in_use','ប្រភេទនេះកំពុងប្រើ។']];const known=errors.find(([key])=>m.includes(key));return json({error:e instanceof Failure?m:known?.[1]||'មិនអាចបញ្ចប់សំណើបានទេ។'},e.status||(known?409:500))}
}};
