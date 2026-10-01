"""Keep the approved model and six combat clips byte-exact; replace only Saber_Death.
Blender's constraint baking can otherwise change unrelated locomotion clips.
"""
from pathlib import Path
import json, struct, copy
HERE=Path(__file__).resolve().parent

def read(path):
    data=path.read_bytes(); length=struct.unpack_from('<I',data,12)[0]
    document=json.loads(data[20:20+length])
    start=20+length; size=struct.unpack_from('<I',data,start)[0]
    return document,data[start+8:start+8+size]

def merge():
    path=HERE/'sector-trooper-saber.glb'
    base,original=read(HERE/'revisions/pre-staged-death/sector-trooper-saber.glb')
    new,binary=read(path)
    nodes={n['name']:i for i,n in enumerate(base['nodes']) if 'name' in n}
    for node in new['nodes']:
        if node.get('name') not in nodes:continue
        old=base['nodes'][nodes[node['name']]]
        assert all(old.get(k)==node.get(k) for k in ['translation','rotation','scale','matrix']),node['name']
    death=copy.deepcopy(next(a for a in new['animations'] if a['name']=='Saber_Death'))
    out=bytearray(original); accessors={}; views={}
    def accessor(index):
        if index in accessors:return accessors[index]
        a=copy.deepcopy(new['accessors'][index]); v=a['bufferView']
        if v not in views:
            view=copy.deepcopy(new['bufferViews'][v]); start=view.get('byteOffset',0)
            out.extend(b'\0'*((-len(out))%4)); view['byteOffset']=len(out);view['buffer']=0
            out.extend(binary[start:start+view['byteLength']])
            views[v]=len(base['bufferViews']);base['bufferViews'].append(view)
        a['bufferView']=views[v]; accessors[index]=len(base['accessors']);base['accessors'].append(a)
        return accessors[index]
    for sampler in death['samplers']:
        sampler['input']=accessor(sampler['input']);sampler['output']=accessor(sampler['output'])
    for channel in death['channels']:
        channel['target']['node']=nodes[new['nodes'][channel['target']['node']]['name']]
    base['animations']=[a for a in base['animations'] if a['name']!='Saber_Death']+[death]
    base['buffers'][0]['byteLength']=len(out)
    document=json.dumps(base,separators=(',',':')).encode();document+=b' '*((-len(document))%4)
    out.extend(b'\0'*((-len(out))%4))
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(document)+len(out))+struct.pack('<II',len(document),0x4e4f534a)+document+struct.pack('<II',len(out),0x004e4942)+out)
    print('Preserved six approved combat clips; replaced Saber_Death')
if __name__=='__main__':merge()
