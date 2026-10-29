export const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
export const fragment = `#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform vec2 resolution;
uniform float time,blend,displacement,spiral,rings,tunnel,symmetry,zoom,brightness,luminance,pulse,transition;
uniform sampler2D texA,texB,oldA,oldB;
uniform vec4 present,layerActive,variants;
uniform float linearBlend;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}return v;}
vec3 cosmos(vec2 p,float variant){
  vec2 q=(p-.5)*vec2(1.8,1.);float n=fbm(q*3.+variant*4.+vec2(time*.012,0.));float smoke=pow(fbm(q*5.+n*2.),2.4);
  vec3 c=mix(vec3(.012,.018,.055),vec3(.18,.12,.29),smoke*2.);
  float river=exp(-abs(q.y+.3*sin(q.x*2.+n))*(10.+3.*n));
  c+=river*smoke*mix(vec3(.3,.16,.07),vec3(.7,.48,.19),n);
  vec2 grid=p*vec2(550.,310.);vec2 id=floor(grid),f=fract(grid)-.5;float h=hash(id+variant);
  c+=step(.995,h)*exp(-dot(f,f)*140.)*vec3(.8,.74,.61);
  float r=length(q);float a=atan(q.y,q.x);float halo=exp(-abs(r-(.26+.012*sin(a*12.)))*280.);
  c+=halo*vec3(.48,.32,.12)*(.7+.3*sin(a*18.+time*.03));
  return c;
}
vec2 mirrorUV(vec2 p){return 1.-abs(mod(p,2.)-1.);}
vec3 procedural(vec2 p,float variant){return variant>.5?cosmos(p.yx,2.):cosmos(p,0.);}
vec3 pairColor(sampler2D a,sampler2D b,vec2 p,vec2 flags,vec2 enabled,vec2 variant){
  if(enabled.x<.5&&enabled.y<.5)return cosmos(p,0.);
  vec3 ca=flags.x>.5?texture(a,mirrorUV(p)).rgb:procedural(p,variant.x);
  if(enabled.y<.5)return ca;
  vec3 cb=flags.y>.5?texture(b,mirrorUV(p)).rgb:procedural(p,variant.y);
  if(enabled.x<.5)return cb;
  vec3 screen=1.-(1.-ca)*(1.-cb);
  return mix(ca,mix(cb,screen,.25*(1.-linearBlend)),blend);
}
void main(){
  vec2 c=(uv-.5)*vec2(resolution.x/resolution.y,1.);float r=length(c),a=atan(c.y,c.x);
  float sym=abs(mod(a+3.14159265/6.,6.2831853/6.)-3.14159265/6.);
  a=mix(a,sym,symmetry)+spiral*r+time*.04*tunnel;
  float travel=mix(r,fract(-log(max(r,.012))*.22-time*.06),tunnel);
  travel=mix(travel,abs(sin(r*18.-time*.18))*.45,rings*.65);
  vec2 p=vec2(cos(a),sin(a))*travel/zoom;p.x/=resolution.x/resolution.y;p+=.5;
  p+=vec2(sin(p.y*12.+time*.17),cos(p.x*10.-time*.13))*displacement*.13;
  vec3 col=pairColor(texA,texB,p,present.xy,layerActive.xy,variants.xy);
  if(transition<.999)col=mix(pairColor(oldA,oldB,p,present.zw,layerActive.zw,variants.zw),col,transition);
  col*=brightness*luminance*(1.+pulse);col*=1.-.32*smoothstep(.15,.85,r);
  col=col/(1.+col*.25);color=vec4(col,1.);
}`;
