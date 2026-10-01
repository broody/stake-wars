"""Upright thigh and shaped shin profiles from the user's detailed leg sheet.

Shared geometry helpers and materials are supplied by the calling builder.
The boots and ankle seals are separate and are not rebuilt here.
"""
import bpy
from mathutils import Vector


def notch(cs,start=.30,full=.75):
    """A flat central cutout with angled corners, rather than a pointed V."""
    return max(0,min(1,(cs-start)/(full-start)))


def build_segments(side,label):
    created=[]
    def remember(obj):
        created.append(obj)
        return obj

    remember(loft(label+" 01 hip and thigh undersuit",[
        ring(side,70,-187,23,25,27),ring(side,74,-213,32,31,31),
        ring(side,81,-254,29,33,30),ring(side,85,-290,25,28,27),
        ring(side,86,-322,23,26,25),
    ],black,caps=True))
    thigh=remember(loft(label+" 02 faceted thigh armor",[
        ring(side,74,-217,34,39,32,lambda sn,cs:28*sn+4*max(-cs,0)),
        ring(side,82,-253,36,47,36,lambda sn,cs:5*sn+6*max(-cs,0)-4*max(cs,0)**2),
        ring(side,86,-300,32,40,31,lambda sn,cs:17*notch(cs)+7*max(-cs,0)),
    ],thickness=3,seed=2))
    thigh["rig_segment"]="thigh"
    thigh["profile_notes"]="Straighter hip-to-knee line and flat-topped knee clearance"

    remember(loft(label+" 03 knee joint",[
        ring(side,86,-287,19,25,25),ring(side,86,-307,27,33,29),
        ring(side,87,-331,25,31,28),ring(side,88,-350,20,23,24),
    ],black,caps=True))
    remember(shield(label+" 04 charcoal knee guard",side,[
        (70,-35,-286),(102,-35,-286),(113,-30,-300),(114,-31,-324),
        (100,-36,-350),(72,-36,-350),(59,-30,-326),(59,-30,-301),
    ],(86,-44,-317),black,2))
    inlay=remember(shield(label+" 05 amber knee inlay",side,[
        (86,-41,-296),(98,-43,-314),(74,-43,-314),
    ],(86,-45,-307),ivory,0))
    # Warm yellow-orange paint in the detail sheet, without introducing a lamp.
    attr=inlay.data.color_attributes["ArmorTone"]
    gold=["FFD05A","F6BD45","EAB044"]
    for face in inlay.data.polygons:
        for loop in face.loop_indices:
            attr.data[loop].color=rgba(gold[face.index%len(gold)])
    inlay["finish"]="Warm gold painted inlay"

    remember(loft(label+" 06 lower leg undersuit",[
        ring(side,88,-336,23,26,25),ring(side,91,-364,30,32,30),
        ring(side,96,-398,23,24,23),ring(side,98,-428,20,22,22),
    ],black,caps=True))
    shin=remember(loft(label+" 07 notched shin armor",[
        ring(side,87,-326,39,44,34,lambda sn,cs:-29*notch(cs)-10*max(-cs,0)-4*(1-abs(cs))**4),
        ring(side,91,-363,42,47,36,lambda sn,cs:4*sn-3*max(cs,0)**2),
        ring(side,96,-391,36,37,30,lambda sn,cs:4*sn-2*cs),
        ring(side,98,-413,35,35,29,lambda sn,cs:8*notch(cs,.35,.75)),
    ],thickness=3,seed=7))
    shin["rig_segment"]="shin"
    shin["profile_notes"]="Flat-bottom knee recess, fuller upper calf, gentle taper and close ankle cuff"
    for obj in created:
        obj["model_part"]="leg_segment"
        obj["alignment_revision"]=2
        obj["side"]=label
    return created


def add_leg_detail_cameras(stage):
    target=Vector((0,0,-328*S))
    for name,offset,scale in [
        ("Lower Body Front",(0,-6,0),.98),
        ("Lower Body Hero",(-4,-6,1.8),1.04),
        ("Lower Body Side",(-6,0,0),.98),
    ]:
        full="TROOPER CAM | "+name
        obj=bpy.data.objects.get(full)
        if not obj:
            obj=bpy.data.objects.new(full,bpy.data.cameras.new(full))
            stage.objects.link(obj)
        obj.location=target+Vector(offset)
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        obj.data.type="ORTHO"
        obj.data.ortho_scale=scale
