const base=import.meta.env.PUBLIC_POCKETBASE_URL||'https://admin.videotheatre.gr';
const list=async(collection,params)=>{try{const r=await fetch(base+'/api/collections/'+collection+'/records?'+new URLSearchParams(params));return r.ok?(await r.json()).items||[]:[]}catch{return []}};
export const mediaUrl=r=>r?.id&&r?.file?base+'/api/files/media/'+r.id+'/'+r.file:null;
export async function shows(lang="el"){
 const [venues,productions,runs]=await Promise.all([list('venues',{filter:'editorial_status="published"',perPage:'100'}),list('productions',{filter:'editorial_status="published"',expand:'poster,hero_image',perPage:'200'}),list('runs',{perPage:'200'})]);
 const venue=venues.find(v=>/athinaion|αθήναιον|αθηναιον/i.test((v.slug||'')+' '+v.name));if(!venue)return [];
 const ids=new Set(runs.filter(r=>r.venue===venue.id).map(r=>r.production));
 return (await Promise.all(productions.filter(p=>ids.has(p.id)).map(async p=>{const tr=await list('production_translations',{filter:'production="'+p.id+'" && language="'+lang+'" && translation_status="published"',perPage:'1'});return {...p,title:tr[0]?.title||'',poster:mediaUrl(p.expand?.poster)}}))).filter(p=>p.title).slice(0,6);
}