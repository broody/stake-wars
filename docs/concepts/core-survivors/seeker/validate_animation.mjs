import fs from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const require=createRequire(resolve(here,'../../../../apps/web/package.json'));
const {GLTFLoader}=await import(require.resolve('three/examples/jsm/loaders/GLTFLoader.js'));
const {AnimationMixer,LoopOnce,Vector3,Box3}=await import(resolve(dirname(require.resolve('three')),'three.module.js'));
const bytes=fs.readFileSync(resolve(here,'seeker.glb'));
const glb=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const root=glb.scene;const meshes=[],bones=[];root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);if(o.isBone)bones.push(o);});
const mixer=new AnimationMixer(root);
const actions=Object.fromEntries(glb.animations.map(clip=>{const a=mixer.clipAction(clip);a.setLoop(LoopOnce,1);a.clampWhenFinished=true;a.play();a.paused=true;a.setEffectiveWeight(0);return [clip.name,a];}));
const expected={Idle:2,Walk:1.2,Run:.65,ChargeWindup:.8,Charge:.25,ChargeRecover:.6,ChargeAttack:2.4,Defeated:1.8};
const assert=(value,message)=>{if(!value)throw Error(message);};
function sample(name,time){for(const a of Object.values(actions))a.setEffectiveWeight(0);const a=actions[name];a.time=time;a.setEffectiveWeight(1);mixer.update(0);root.updateMatrixWorld(true);for(const m of meshes)m.skeleton.update();}
function snapshot(){return bones.flatMap(b=>b.matrixWorld.elements.slice());}
function gap(a,b){return Math.max(...a.map((v,i)=>Math.abs(v-b[i])));}
const results={};const v=new Vector3();
for(const [name,duration] of Object.entries(expected)){
 assert(actions[name],`Missing ${name}`);assert(Math.abs(actions[name].getClip().duration-duration)<1e-6,`Wrong duration ${name}`);
 let floor=Infinity,top=-Infinity,maxJointError=0;
 const lengths=new Map();sample('Idle',0);
 for(const bone of bones)if(bone.parent?.isBone && !['Body','Neck','Head','FinL','FinR'].includes(bone.name))lengths.set(bone.name,bone.position.length());
 for(let i=0;i<=Math.ceil(duration*240);i++){
  sample(name,Math.min(duration,i/240));
  for(const bone of bones){assert(bone.matrixWorld.elements.every(Number.isFinite),`${name} nonfinite`);if(lengths.has(bone.name))maxJointError=Math.max(maxJointError,Math.abs(bone.position.length()-lengths.get(bone.name)));}
  for(const mesh of meshes)for(let n=0;n<mesh.geometry.attributes.position.count;n++){mesh.getVertexPosition(n,v);mesh.localToWorld(v);floor=Math.min(floor,v.y);top=Math.max(top,v.y);}
 }
 sample(name,0);const start=snapshot();sample(name,duration);const end=snapshot();
 const loopGap=gap(start,end);
 results[name]={duration,minGround:floor,maxHeight:top,maxJointError,loopGap};
 assert(floor>-.001,`${name} penetrates ground ${floor}`);assert(maxJointError<.002,`${name} stretches joints ${maxJointError}`);
 if(['Idle','Walk','Run','Charge'].includes(name))assert(loopGap<.00002,`${name} loop pops ${loopGap}`);
}
for(const [a,b] of [['ChargeWindup','Charge'],['Charge','ChargeRecover'],['ChargeRecover','Idle']]){
 sample(a,expected[a]);const end=snapshot();sample(b,0);const difference=gap(end,snapshot());assert(difference<.00002,`${a}->${b} discontinuity ${difference}`);
}
sample('ChargeAttack',.8);const before=root.getObjectByName('Root').getWorldPosition(new Vector3());sample('ChargeAttack',2.4);const after=root.getObjectByName('Root').getWorldPosition(new Vector3());assert(Math.abs(after.z-before.z-12)<.00001,'Charge distance');
// A stance paw must remain planted while the complete charge travels forward.
sample('ChargeAttack',.82);const planted=root.getObjectByName('FrontLFoot').getWorldPosition(new Vector3());
sample('ChargeAttack',.86);const plantedLater=root.getObjectByName('FrontLFoot').getWorldPosition(new Vector3());
assert(planted.distanceTo(plantedLater)<.012,'Charge stance foot slides');
sample('Defeated',1.5);const settled=snapshot();sample('Defeated',1.8);assert(gap(settled,snapshot())<.00002,'Death does not hold');
// Authored fin span is wider while stalking and narrow throughout the charge.
function finSpan(name,time){
 sample(name,time);let lo=Infinity,hi=-Infinity;
 for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
  const bone=mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getX(i)];
  if(!['FinL','FinR'].includes(bone.name))continue;
  mesh.getVertexPosition(i,v);mesh.localToWorld(v);lo=Math.min(lo,v.x);hi=Math.max(hi,v.x);
 }
 return hi-lo;
}
const finSpans=Object.fromEntries(['Idle','Walk','Run','Charge'].map(name=>[name,finSpan(name,0)]));
assert(finSpans.Charge<finSpans.Idle*.8,'Charging fins should tuck inward');
assert(finSpans.Run>finSpans.Idle*.9 && finSpans.Walk>finSpans.Idle*.9,'Moving fins should remain spread');
assert(Math.abs(finSpan('ChargeRecover',.6)-finSpans.Idle)<.00002,'Recovery must reopen fins');
const report={passed:true,finSpans,clips:results,chargeDistance:after.z-before.z,phaseTransitions:'continuous',sampleHz:240};
fs.writeFileSync(resolve(here,'animation-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
