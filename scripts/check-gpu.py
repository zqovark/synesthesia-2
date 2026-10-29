"""Compile and render the real GLSL with Mesa EGL / OpenGL ES 3, no browser.

Optional Linux integration check: python scripts/check-gpu.py
Needs libEGL.so.1 and libGL.so.1. This does not validate browser UI or target GPU FPS.
"""
import ctypes as c
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parent.parent
source = subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {vertex,fragment} from './src/visuals/shaders.js'; console.log(JSON.stringify({vertex,fragment}));"
], cwd=root)
shaders = json.loads(source)
E, G = c.CDLL('libEGL.so.1'), c.CDLL('libGL.so.1')
P, I, U, F = c.c_void_p, c.c_int, c.c_uint, c.c_float

def fn(lib, name, result, args):
    f = getattr(lib, name)
    f.restype, f.argtypes = result, args
    return f

get_proc = fn(E, 'eglGetProcAddress', P, [c.c_char_p])
get_display = c.CFUNCTYPE(P, U, P, c.POINTER(I))(get_proc(b'eglGetPlatformDisplayEXT'))
display = get_display(0x31DD, None, None)  # EGL_PLATFORM_SURFACELESS_MESA
major, minor = I(), I()
assert fn(E, 'eglInitialize', U, [P, c.POINTER(I), c.POINTER(I)])(display, c.byref(major), c.byref(minor))
assert fn(E, 'eglBindAPI', U, [U])(0x30A0)  # OPENGL_ES_API
attrs = (I * 13)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3038)
config, count = P(), I()
assert fn(E, 'eglChooseConfig', U, [P, c.POINTER(I), c.POINTER(P), I, c.POINTER(I)])(display, attrs, c.byref(config), 1, c.byref(count)) and count.value
context = fn(E, 'eglCreateContext', P, [P, P, P, c.POINTER(I)])(display, config, None, (I * 3)(0x3098, 3, 0x3038))
width, height = 320, 180
surface = fn(E, 'eglCreatePbufferSurface', P, [P, P, c.POINTER(I)])(display, config, (I * 5)(0x3057, width, 0x3056, height, 0x3038))
assert fn(E, 'eglMakeCurrent', U, [P, P, P, P])(display, surface, surface, context)
shader_ids = []
for name, kind in [('vertex', 0x8B31), ('fragment', 0x8B30)]:
    shader = fn(G, 'glCreateShader', U, [U])(kind)
    text = c.c_char_p(shaders[name].encode())
    fn(G, 'glShaderSource', None, [U, I, c.POINTER(c.c_char_p), c.POINTER(I)])(shader, 1, c.byref(text), None)
    fn(G, 'glCompileShader', None, [U])(shader)
    ok, log = I(), c.create_string_buffer(8192)
    fn(G, 'glGetShaderiv', None, [U, U, c.POINTER(I)])(shader, 0x8B81, c.byref(ok))
    fn(G, 'glGetShaderInfoLog', None, [U, I, c.POINTER(I), c.c_char_p])(shader, 8192, None, log)
    assert ok.value, log.value.decode()
    shader_ids.append(shader)
program = fn(G, 'glCreateProgram', U, [])()
for shader in shader_ids:
    fn(G, 'glAttachShader', None, [U, U])(program, shader)
fn(G, 'glLinkProgram', None, [U])(program)
ok = I()
fn(G, 'glGetProgramiv', None, [U, U, c.POINTER(I)])(program, 0x8B82, c.byref(ok))
assert ok.value, 'Shader link failed'
fn(G, 'glUseProgram', None, [U])(program)
fn(G, 'glViewport', None, [I, I, I, I])(0, 0, width, height)
buffer = U()
fn(G, 'glGenBuffers', None, [I, c.POINTER(U)])(1, c.byref(buffer))
fn(G, 'glBindBuffer', None, [U, U])(0x8892, buffer)
points = (F * 12)(-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1)
fn(G, 'glBufferData', None, [U, c.c_ssize_t, P, U])(0x8892, c.sizeof(points), points, 0x88E4)
position = fn(G, 'glGetAttribLocation', I, [U, c.c_char_p])(program, b'position')
fn(G, 'glEnableVertexAttribArray', None, [U])(position)
fn(G, 'glVertexAttribPointer', None, [U, I, U, U, I, P])(position, 2, 0x1406, 0, 0, None)
location = fn(G, 'glGetUniformLocation', I, [U, c.c_char_p])
uniform = fn(G, 'glUniform1f', None, [I, F])
fn(G, 'glUniform2f', None, [I, F, F])(location(program, b'resolution'), width, height)
for name, value in dict(time=1, blend=.35, displacement=.12, spiral=.15, rings=.2, tunnel=.12, symmetry=0, zoom=1, brightness=.8, luminance=.85, pulse=0, transition=1).items():
    uniform(location(program, name.encode()), value)
pixels = (c.c_ubyte * (width * height * 4))()
draw = fn(G, 'glDrawArrays', None, [U, I, I])
read = fn(G, 'glReadPixels', None, [I, I, I, I, U, U, P])
draw(4, 0, 6)
read(0, 0, width, height, 0x1908, 0x1401, pixels)
first = bytes(pixels)
rgb = [first[i] for i in range(len(first)) if i % 4 != 3]
assert max(rgb) - min(rgb) > 20, 'Frame is blank'
assert all(first[i] == 255 for i in range(3, len(first), 4)), 'Alpha is not opaque'
uniform(location(program, b'zoom'), 2.2)
uniform(location(program, b'symmetry'), .8)
draw(4, 0, 6)
read(0, 0, width, height, 0x1908, 0x1401, pixels)
assert first != bytes(pixels), 'Effects did not change output'
assert fn(G, 'glGetError', U, [])() == 0, 'OpenGL error'
print(json.dumps({'shader_compile': 'passed', 'shader_link': 'passed', 'render': 'passed', 'effects': 'passed', 'driver': fn(G, 'glGetString', c.c_char_p, [U])(0x1F02).decode()}))
fn(E, 'eglMakeCurrent', U, [P, P, P, P])(display, None, None, None)
fn(E, 'eglDestroySurface', U, [P, P])(display, surface)
fn(E, 'eglDestroyContext', U, [P, P])(display, context)
fn(E, 'eglTerminate', U, [P])(display)
