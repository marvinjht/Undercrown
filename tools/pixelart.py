# Placeholder pixel art for the Godot client (godot/art/). Run: python3 tools/pixelart.py
# Every image is drawn here from simple shapes, then outlined and shaded. They are placeholders:
# replace any PNG in godot/art/ with your own art of the same name and size (or any size; the game scales it).
#   heroes/    hero, hero_<class>            32x32, side view facing RIGHT, feet at the bottom
#   weapons/   <weaponType>                  32x32, handle on the LEFT, pointing RIGHT (drawn in the hero's hand)
#   monsters/  <monster id>                  32x32 (bosses 48x48), facing LEFT (toward the hero)
#   icons/     slots, weapons, potions, relics, doors, ui bits   16x16 (doors 24x24)
#   ui/        9-slice frames for panels and buttons, the arena floor
import os, math
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'godot', 'art')

def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def mix(c, f):   # f > 0 lighter, f < 0 darker
    r, g, b, a = c
    if f >= 0: return (int(r + (255 - r) * f), int(g + (255 - g) * f), int(b + (255 - b) * f), a)
    f = -f; return (int(r * (1 - f)), int(g * (1 - f)), int(b * (1 - f)), a)
OUT = hexc('#1a1210')
CLEAR = (0, 0, 0, 0)

class Spr:
    def __init__(s, w, h=None):
        s.w, s.h = w, h or w
        s.p = [[CLEAR] * s.w for _ in range(s.h)]
    def px(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h: s.p[y][x] = c
    def get(s, x, y): return s.p[y][x] if 0 <= x < s.w and 0 <= y < s.h else CLEAR
    def rect(s, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)): s.px(xx, yy, c)
    def ellipse(s, cx, cy, rx, ry, c):
        for yy in range(int(cy - ry - 1), int(cy + ry + 2)):
            for xx in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((xx - cx) / max(rx, .5)) ** 2 + ((yy - cy) / max(ry, .5)) ** 2 <= 1.0: s.px(xx, yy, c)
    def line(s, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(n, 1); x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
            if w == 1: s.px(x, y, c)
            else: s.rect(x - w // 2, y - w // 2, w, w, c)
    def poly(s, pts, c):
        ys = [p[1] for p in pts]
        for yy in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
                if (y0 <= yy + .5 < y1) or (y1 <= yy + .5 < y0):
                    xs.append(x0 + (yy + .5 - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for xx in range(int(round(xs[i])), int(round(xs[i + 1]))): s.px(xx, yy, c)
    # Light from the top left: lighten pixels with open space above/left, darken with open space below/right
    def shade(s, amt=.18):
        q = [row[:] for row in s.p]
        for y in range(s.h):
            for x in range(s.w):
                c = s.p[y][x]
                if c[3] == 0 or c == OUT: continue
                if s.get(x, y - 1)[3] == 0 or s.get(x - 1, y)[3] == 0: q[y][x] = mix(c, amt)
                elif s.get(x, y + 1)[3] == 0 or s.get(x + 1, y)[3] == 0: q[y][x] = mix(c, -amt)
        s.p = q
    def outline(s, c=OUT):
        q = [row[:] for row in s.p]
        for y in range(s.h):
            for x in range(s.w):
                if s.p[y][x][3]: continue
                if any(s.get(x + dx, y + dy)[3] and s.get(x + dx, y + dy) != c for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): q[y][x] = c
        s.p = q
    def flip(s): s.p = [row[::-1] for row in s.p]; return s
    def finish(s, shade=True, outline=True):
        if shade: s.shade()
        if outline: s.outline()
        return s
    def save(s, rel, scale=1):
        path = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img = Image.new('RGBA', (s.w, s.h))
        img.putdata([c for row in s.p for c in row])
        if scale != 1: img = img.resize((s.w * scale, s.h * scale), Image.NEAREST)
        img.save(path)

# ---------------------------------------------------------------- heroes (facing right)
SKIN = hexc('#e8b48a')
def hero(kind):
    s = Spr(32)
    C = {'plain': ('#d9d4cc', '#8a8580'), 'warrior': ('#c84b3e', '#7d7f86'), 'mage': ('#7a5fd6', '#4b3a8c'),
         'archer': ('#4f9a46', '#6b4a2e'), 'paladin': ('#e9d79a', '#c9cdd6'), 'rogue': ('#56607a', '#2e3344')}[kind]
    body, trim = hexc(C[0]), hexc(C[1])
    boots = hexc('#4a3426')
    # legs and boots
    s.rect(12, 24, 3, 5, mix(trim, -.2)); s.rect(17, 24, 3, 5, mix(trim, -.2))
    s.rect(11, 28, 5, 2, boots); s.rect(17, 28, 5, 2, boots)
    # torso
    if kind == 'mage':
        s.poly([(10, 15), (22, 15), (24, 29), (8, 29)], body)          # robe to the floor
        s.rect(15, 15, 2, 14, mix(body, .25))
    else:
        s.rect(10, 15, 12, 10, body)
        s.rect(10, 22, 12, 2, trim)                                      # belt
        if kind in ('warrior', 'paladin'): s.rect(10, 15, 12, 3, trim)   # pauldrons
    # back arm
    s.rect(8, 16, 3, 7, mix(body, -.25)); s.rect(8, 22, 3, 2, SKIN)
    # head
    s.ellipse(16, 10, 6, 6, SKIN)
    s.px(19, 10, OUT); s.px(19, 9, OUT)                                   # eye
    if kind == 'plain': s.ellipse(14, 6, 6, 3, hexc('#6b4a2e')); s.rect(9, 6, 4, 5, hexc('#6b4a2e'))
    if kind == 'warrior':
        s.ellipse(16, 7, 7, 5, trim); s.rect(9, 7, 15, 2, mix(trim, -.15)); s.rect(18, 9, 1, 4, mix(trim, -.3))
        s.line(10, 4, 7, 0, hexc('#efe6d8')); s.line(22, 4, 25, 0, hexc('#efe6d8'))   # horns
    if kind == 'mage':
        s.poly([(8, 9), (25, 9), (19, 0), (14, -2)], body); s.rect(8, 8, 17, 2, mix(body, -.2)); s.px(18, 3, hexc('#ffe08a'))
    if kind == 'archer':
        s.poly([(9, 12), (10, 4), (17, 2), (23, 6), (21, 9), (12, 16)], body)            # hood
        s.rect(6, 13, 3, 10, hexc('#6b4a2e')); s.line(6, 13, 5, 9, hexc('#d9d4cc')); s.line(8, 13, 8, 9, hexc('#d9d4cc'))   # quiver
    if kind == 'paladin':
        s.ellipse(16, 8, 7, 6, trim); s.rect(17, 8, 6, 2, OUT); s.rect(15, 1, 2, 4, hexc('#c84b3e'))
        s.ellipse(16, 0, 8, 1.5, hexc('#ffe08a', 200))                                       # halo
    if kind == 'rogue':
        s.poly([(9, 13), (10, 4), (17, 2), (23, 6), (22, 11), (12, 16)], body)
        s.rect(15, 11, 8, 3, mix(body, -.35))                                              # mask
    # front arm (holds the weapon at about (22, 20))
    s.rect(19, 16, 3, 6, mix(body, .1)); s.rect(20, 21, 3, 2, SKIN)
    return s.finish()

# ---------------------------------------------------------------- weapons (handle left, pointing right)
STEEL, DSTEEL, WOOD, GOLD = hexc('#c9cdd6'), hexc('#7d818c'), hexc('#7a5434'), hexc('#e8c25a')
def weapon(w):
    s = Spr(32)
    if w == 'daggers':
        for dy in (0, 6):
            s.rect(2, 14 + dy, 4, 2, WOOD); s.rect(6, 13 + dy, 1, 4, GOLD); s.poly([(7, 14 + dy), (17, 15 + dy), (7, 16 + dy)], STEEL)
    if w == 'saber':
        s.rect(2, 15, 5, 2, WOOD); s.rect(7, 13, 1, 6, GOLD)
        for i in range(20): s.rect(8 + i, 15 - int((i / 20) ** 2 * 5), 1, 2, STEEL)
    if w == 'swordShield':
        s.rect(2, 15, 4, 2, WOOD); s.rect(6, 13, 1, 6, GOLD); s.poly([(7, 14), (24, 15), (7, 17)], STEEL)
        s.poly([(10, 6), (19, 6), (19, 16), (14.5, 22), (10, 16)], hexc('#8c3b32')); s.rect(14, 7, 1, 13, GOLD); s.rect(11, 11, 8, 1, GOLD)
    if w == 'longsword':
        s.rect(1, 15, 6, 2, WOOD); s.rect(7, 12, 1, 8, GOLD); s.poly([(8, 14), (30, 15.5), (8, 17)], STEEL); s.line(9, 15, 27, 15, mix(STEEL, .4))
    if w == 'greatAxe':
        s.rect(1, 15, 24, 2, WOOD); s.poly([(18, 15), (22, 6), (28, 5), (29, 15), (28, 25), (22, 24), (18, 17)], STEEL)
    if w == 'greatHammer':
        s.rect(1, 15, 20, 2, WOOD); s.rect(19, 7, 10, 18, DSTEEL); s.rect(19, 7, 10, 2, STEEL); s.rect(19, 23, 10, 2, STEEL)
    if w == 'mace':
        s.rect(2, 15, 14, 2, WOOD); s.ellipse(21, 16, 5, 5, DSTEEL)
        for a in range(0, 360, 60): s.px(21 + 7 * math.cos(math.radians(a)), 16 + 7 * math.sin(math.radians(a)), STEEL)
    if w == 'maceShield':
        s.rect(2, 15, 12, 2, WOOD); s.ellipse(18, 16, 4, 4, DSTEEL)
        s.ellipse(12, 13, 6, 7, hexc('#3f5f9a')); s.ellipse(12, 13, 2, 2, GOLD)
    if w == 'shortbow':
        for i in range(-8, 9): s.px(14 + 5 * (1 - (i / 8) ** 2), 16 + i, WOOD)
        s.line(14, 8, 14, 24, hexc('#efe6d8')); s.line(6, 16, 22, 16, DSTEEL); s.poly([(22, 14), (26, 16), (22, 18)], STEEL)
    if w == 'longbow':
        for i in range(-13, 14): s.px(13 + 6 * (1 - (i / 13) ** 2), 16 + i, WOOD)
        s.line(13, 3, 13, 29, hexc('#efe6d8')); s.line(4, 16, 25, 16, DSTEEL); s.poly([(25, 14), (30, 16), (25, 18)], STEEL)
    if w == 'wandFocus':
        s.rect(3, 15, 14, 2, hexc('#5a3a6e')); s.ellipse(20, 15.5, 3, 3, hexc('#b48cff')); s.px(20, 14, hexc('#ffffff'))
        s.ellipse(9, 8, 3, 3, hexc('#5fd0ff')); s.px(8, 7, hexc('#ffffff'))
    if w == 'staff':
        s.rect(0, 15, 24, 2, WOOD); s.ellipse(26, 16, 3.5, 3.5, hexc('#ff7a3c')); s.px(25, 15, hexc('#ffe08a'))
        s.line(23, 13, 24, 11, WOOD); s.line(23, 19, 24, 21, WOOD)
    return s.finish(shade=True)

# ---------------------------------------------------------------- monsters (facing left)
def eye(s, x, y, c='#ff4a3a'): s.px(x, y, hexc(c))
def monster(m):
    big = m in ('boneKing', 'gorehorn', 'warden', 'yeti', 'wraithKing', 'alphaWolf', 'occultist', 'mire', 'hydra')
    s = Spr(48 if big else 32); W = s.w
    g = lambda h: hexc(h)
    if m == 'rat':
        s.ellipse(17, 23, 9, 5, g('#8a7a6a')); s.ellipse(9, 21, 4, 3.5, g('#8a7a6a')); s.ellipse(10, 17, 2, 2, g('#c99a8a'))
        s.line(26, 24, 30, 20, g('#c99a8a')); eye(s, 7, 20); s.px(5, 22, g('#e08a8a')); s.rect(12, 27, 2, 2, g('#c99a8a')); s.rect(21, 27, 2, 2, g('#c99a8a'))
    if m in ('slime', 'slimeElite'):
        c = g('#5cc35a') if m == 'slime' else g('#a35cd6')
        s.ellipse(16, 22, 11 if m == 'slime' else 13, 8, c); s.rect(5, 22, 23, 6, c); s.ellipse(12, 17, 3, 2, mix(c, .4))
        eye(s, 11, 22, '#1a1210'); eye(s, 17, 22, '#1a1210'); s.px(11, 21, g('#ffffff')); s.px(17, 21, g('#ffffff'))
        if m == 'slimeElite': s.poly([(10, 13), (12, 9), (14, 12), (16, 8), (18, 12), (20, 9), (22, 13)], GOLD)
    if m == 'wolf':
        c = g('#7d7f86'); s.ellipse(18, 19, 9, 5, c); s.ellipse(8, 15, 5, 4, c); s.poly([(3, 16), (0, 18), (4, 19)], c)
        s.poly([(8, 11), (9, 7), (11, 11)], c); for_legs(s, [11, 14, 21, 24], 23, 6, mix(c, -.2)); s.line(27, 17, 31, 13, c); eye(s, 6, 14, '#ffd84a')
    if m == 'snake':
        c = g('#5aa04a');
        for i in range(0, 22): s.ellipse(26 - i, 24 + 3 * math.sin(i / 3.2), 2.5, 2.5, c)
        s.ellipse(6, 16, 4, 3, c); s.rect(5, 18, 3, 6, c); eye(s, 5, 15, '#ffd84a'); s.line(2, 17, 0, 18, g('#e04a4a'))
    if m == 'hydra':
        c = g('#3f8a5a'); s.ellipse(26, 36, 14, 8, c)
        for hx, hy in ((10, 12), (20, 6), (32, 12)):
            s.line(hx + 6, 32, hx, hy + 4, c, 4); s.ellipse(hx, hy, 5, 4, c); eye(s, hx - 3, hy - 1, '#ffd84a'); s.line(hx - 5, hy + 1, hx - 7, hy + 2, g('#e04a4a'))
    if m in ('skeleton', 'skeletonArcher', 'boneKing'):
        k = 1.5 if m == 'boneKing' else 1; B = g('#e6e0d0'); ox = 4 if m == 'boneKing' else 0
        s.ellipse(14 * k + ox, 8 * k, 5 * k, 5 * k, B); s.rect((10) * k + ox, 11 * k, 7 * k, 3 * k, B)
        s.px(12 * k + ox, 8 * k, OUT); s.px(12 * k + ox + 1, 8 * k, OUT); s.px(16 * k + ox, 8 * k, OUT)
        s.rect(13 * k + ox, 14 * k, 2 * k, 10 * k, B)
        for i in range(3): s.rect(10 * k + ox, (16 + 2 * i) * k, 8 * k, 1 * k, B)
        s.line(11 * k + ox, 24 * k, 10 * k + ox, 30 * k, B, int(2 * k)); s.line(16 * k + ox, 24 * k, 17 * k + ox, 30 * k, B, int(2 * k))
        s.line(10 * k + ox, 16 * k, 7 * k + ox, 22 * k, B, int(k))
        if m == 'skeletonArcher':
            for i in range(-8, 9): s.px(5 - 4 * (1 - (i / 8) ** 2), 18 + i, WOOD)
        else: s.line(7 * k + ox, 22 * k, 1 * k + ox, 12 * k, STEEL, int(2 * k))
        if m == 'boneKing':
            s.poly([(13, 6), (15, 1), (18, 5), (21, 0), (24, 5), (27, 1), (29, 6)], GOLD)
            s.poly([(24, 20), (40, 18), (44, 44), (26, 44)], g('#6e2a3a'))
    if m == 'disciple':
        c = g('#5a3a8a'); s.poly([(10, 10), (22, 10), (25, 30), (7, 30)], c); s.ellipse(16, 9, 6, 6, c); s.ellipse(14, 10, 3, 3, OUT)
        eye(s, 13, 10, '#c9a0ff'); s.ellipse(5, 18, 2.5, 2.5, g('#c9a0ff'))
    if m == 'goblin':
        c = g('#7ab84a'); s.rect(12, 16, 8, 9, g('#6b4a2e')); s.ellipse(16, 11, 5, 5, c); s.poly([(11, 10), (5, 7), (11, 12)], c); s.poly([(21, 10), (26, 7), (21, 12)], c)
        eye(s, 13, 10, '#ffd84a'); for_legs(s, [13, 18], 25, 5, c); s.line(10, 19, 5, 15, STEEL)
    if m == 'thief':
        c = g('#3a3a4a'); s.rect(11, 15, 10, 10, c); s.poly([(10, 14), (11, 4), (17, 2), (22, 6), (21, 14)], mix(c, .15)); s.rect(11, 10, 8, 3, g('#e8b48a'))
        eye(s, 12, 11, '#1a1210'); s.rect(10, 12, 9, 2, g('#8a2a2a')); for_legs(s, [12, 18], 25, 5, mix(c, -.2)); s.line(10, 19, 4, 17, STEEL); s.ellipse(22, 20, 3, 3, g('#a07a3a'))
    if m == 'orc':
        c = g('#6f8a4a'); s.rect(9, 14, 14, 11, g('#6b4a2e')); s.ellipse(15, 9, 6, 6, c); s.rect(6, 14, 4, 9, c); s.rect(22, 14, 4, 9, c)
        eye(s, 12, 8, '#ff4a3a'); s.px(11, 12, g('#efe6d8')); s.px(14, 12, g('#efe6d8')); for_legs(s, [11, 18], 25, 5, mix(c, -.2))
        s.rect(3, 6, 2, 18, WOOD); s.poly([(0, 6), (5, 4), (7, 10), (2, 12)], STEEL)
    if m == 'golem':
        c = g('#8a8070'); s.rect(8, 10, 16, 14, c); s.rect(11, 3, 10, 8, c); s.rect(3, 12, 6, 12, mix(c, -.1)); s.rect(23, 12, 6, 12, mix(c, -.1))
        s.rect(9, 24, 5, 6, c); s.rect(18, 24, 5, 6, c); eye(s, 13, 6, '#5fd0ff'); eye(s, 17, 6, '#5fd0ff'); s.line(12, 14, 18, 20, mix(c, -.35))
    if m in ('wraith', 'wraithKing'):
        k = 1.5 if m == 'wraithKing' else 1; c = g('#3f6a7a'); ox = 4 if m == 'wraithKing' else 0
        s.ellipse(16 * k + ox, 11 * k, 6 * k, 6 * k, c); s.poly([(10 * k + ox, 12 * k), (22 * k + ox, 12 * k), (25 * k + ox, 28 * k), (21 * k + ox, 25 * k), (18 * k + ox, 29 * k), (15 * k + ox, 25 * k), (11 * k + ox, 29 * k), (8 * k + ox, 26 * k)], c)
        s.ellipse(15 * k + ox, 12 * k, 3 * k, 3 * k, OUT); eye(s, 13 * k + ox, 12 * k, '#7fffe0'); eye(s, 16 * k + ox, 12 * k, '#7fffe0')
        s.line(10 * k + ox, 15 * k, 4 * k + ox, 20 * k, c, int(2 * k))
        if m == 'wraithKing': s.poly([(16, 9), (18, 3), (21, 7), (24, 2), (27, 7), (30, 3), (32, 9)], GOLD)
    if m == 'troll':
        c = g('#5a8a7a'); s.ellipse(16, 17, 9, 9, c); s.ellipse(9, 9, 5, 4, c); s.rect(4, 14, 4, 12, c); s.rect(24, 14, 4, 10, c)
        eye(s, 7, 8, '#ffd84a'); s.px(5, 11, g('#efe6d8')); for_legs(s, [12, 20], 25, 5, mix(c, -.2)); s.line(4, 26, 1, 12, WOOD, 3)
    if m == 'ogre':
        c = g('#c99a6a'); s.ellipse(16, 18, 11, 9, c); s.ellipse(14, 8, 5, 5, c); s.rect(3, 13, 5, 10, c); s.rect(25, 13, 5, 10, c)
        s.rect(7, 21, 18, 3, g('#6b4a2e')); eye(s, 12, 7, '#1a1210'); for_legs(s, [11, 19], 26, 4, mix(c, -.2)); s.line(4, 23, 0, 8, WOOD, 3)
    if m == 'cultist':
        c = g('#8a2a2a'); s.poly([(10, 11), (22, 11), (25, 30), (7, 30)], c); s.ellipse(16, 9, 6, 6, c); s.ellipse(14, 10, 3, 3, OUT); eye(s, 13, 10, '#ffd84a')
        s.line(9, 18, 4, 14, STEEL); s.px(4, 13, g('#e04a4a'))
    if m == 'ghoul':
        c = g('#7a8a6a'); s.ellipse(17, 19, 8, 6, c); s.ellipse(9, 13, 5, 5, c); eye(s, 7, 12, '#e0ff4a'); s.rect(4, 17, 3, 8, c)
        s.line(4, 25, 1, 27, g('#efe6d8')); for_legs(s, [13, 21], 24, 6, mix(c, -.2))
    if m == 'jester':
        s.rect(11, 15, 10, 10, g('#d64a4a')); s.rect(16, 15, 5, 10, g('#e8c25a')); s.ellipse(16, 10, 5, 5, SKIN)
        s.poly([(10, 8), (5, 2), (14, 6), (16, 0), (18, 6), (27, 2), (22, 8)], g('#7a5fd6')); s.px(5, 2, GOLD); s.px(16, 0, GOLD); s.px(27, 2, GOLD)
        eye(s, 13, 10, '#1a1210'); s.line(12, 12, 15, 13, g('#c84b3e')); for_legs(s, [13, 18], 25, 5, g('#7a5fd6'))
    if m == 'gorehorn':
        c = g('#8a4a32'); s.ellipse(26, 26, 14, 11, c); s.ellipse(12, 18, 8, 7, c); s.poly([(9, 13), (2, 3), (12, 11)], g('#efe6d8')); s.poly([(16, 12), (20, 2), (18, 13)], g('#efe6d8'))
        eye(s, 8, 17, '#ff4a3a'); s.rect(5, 21, 4, 3, mix(c, .3)); for_legs(s, [16, 22, 30, 36], 34, 10, mix(c, -.25))
    if m == 'warden':
        c = g('#7d818c'); s.rect(16, 14, 18, 20, c); s.ellipse(25, 10, 7, 7, c); s.rect(20, 9, 10, 2, OUT); eye(s, 21, 10, '#ffb84a')
        s.poly([(4, 12), (16, 12), (16, 34), (10, 40), (4, 34)], g('#3f5f9a')); s.rect(9, 13, 2, 26, GOLD)
        for_legs(s, [19, 28], 34, 9, mix(c, -.2)); s.rect(34, 16, 5, 14, c)
    if m == 'yeti':
        c = g('#e6eef2'); s.ellipse(26, 26, 15, 14, c); s.ellipse(17, 13, 8, 7, c); s.rect(7, 18, 6, 16, c); s.rect(38, 20, 6, 14, c)
        s.ellipse(14, 14, 4, 3, g('#9ab0c4')); eye(s, 12, 13, '#3a5aff'); s.px(13, 17, g('#ffffff')); for_legs(s, [18, 30], 38, 8, mix(c, -.15))
    if m == 'alphaWolf':
        c = g('#4a4c56'); s.ellipse(28, 28, 14, 8, c); s.ellipse(13, 21, 8, 6, c); s.poly([(6, 22), (0, 25), (6, 27)], c); s.poly([(12, 15), (14, 8), (17, 15)], c)
        eye(s, 9, 20, '#ff4a3a'); s.line(10, 18, 14, 24, g('#c9473a')); for_legs(s, [17, 22, 32, 37], 34, 10, mix(c, -.2)); s.line(41, 26, 47, 19, c, 2)
    if m == 'occultist':
        c = g('#4a2a6a'); s.poly([(14, 14), (32, 14), (37, 44), (9, 44)], c); s.ellipse(23, 12, 8, 8, c); s.ellipse(21, 13, 4, 4, OUT); eye(s, 20, 13, '#ff4aff')
        s.line(9, 44, 6, 8, WOOD, 2); s.ellipse(6, 7, 4, 4, g('#ff4aff')); s.ellipse(38, 8, 4, 3, g('#efe6d8')); s.px(37, 8, g('#c9473a'))
    if m == 'mire':
        c = g('#5a6a3a'); s.ellipse(24, 32, 18, 12, c); s.rect(6, 32, 36, 12, c); s.ellipse(18, 20, 7, 6, mix(c, .1))
        eye(s, 15, 19, '#e0ff4a'); eye(s, 20, 19, '#e0ff4a'); s.line(12, 24, 18, 26, OUT)
        for x in (10, 22, 34): s.line(x, 32, x - 2, 40, mix(c, -.3))
    return s.finish()

def for_legs(s, xs, y, h, c):
    for x in xs: s.rect(x, y, 2, h, c)

# ---------------------------------------------------------------- icons (16x16)
def icon_slot(k):
    s = Spr(16); c = STEEL
    if k == 'weapon': s.line(3, 13, 13, 3, c, 2); s.line(3, 10, 6, 13, GOLD)
    if k == 'helmet': s.ellipse(8, 8, 6, 5, c); s.rect(2, 8, 12, 5, c); s.rect(5, 9, 6, 2, OUT)
    if k == 'chest': s.poly([(3, 3), (13, 3), (14, 7), (12, 8), (12, 14), (4, 14), (4, 8), (2, 7)], c)
    if k == 'gloves': s.rect(4, 6, 7, 8, c); for_legs(s, [4, 6, 8], 2, 4, c); s.rect(11, 7, 2, 4, c)
    if k == 'legs': s.rect(4, 2, 8, 4, c); s.rect(4, 6, 3, 9, c); s.rect(9, 6, 3, 9, c)
    if k == 'boots': s.rect(5, 2, 5, 9, c); s.rect(5, 11, 9, 3, c)
    return s.finish()
def icon_from(sprite):   # a 32x32 sprite at half size
    s = Spr(16)
    for y in range(16):
        for x in range(16):
            cs = [sprite.get(2 * x + dx, 2 * y + dy) for dx in (0, 1) for dy in (0, 1)]
            op = [c for c in cs if c[3] and c != OUT]
            if op: s.p[y][x] = op[0]
    return s.finish(shade=False)
POTION = {'potion': '#d6403a', 'greater': '#ff5a6a', 'antidote': '#5cc35a', 'iron': '#9aa3b5', 'salve': '#ff9ac8', 'fury': '#ff8a2a', 'tonic': '#4ab4ff', 'draught': '#a35cd6'}
def icon_potion(k):
    s = Spr(16)
    if k == 'tome':
        s.rect(3, 3, 10, 11, hexc('#7a4a2a')); s.rect(4, 4, 8, 9, hexc('#9a5a32')); s.rect(12, 4, 1, 10, hexc('#efe6d8')); s.rect(6, 6, 4, 1, GOLD); return s.finish()
    if k == 'dye':
        s.rect(6, 2, 4, 3, hexc('#c9cdd6')); s.ellipse(8, 10, 5, 5, hexc('#e0645a'))
        s.ellipse(6, 10, 2, 3, hexc('#a996ff')); s.ellipse(10, 11, 2, 2, hexc('#86d873')); return s.finish()
    c = hexc(POTION.get(k, '#d6403a')); big = k == 'greater'
    s.rect(6, 2, 4, 2, hexc('#a07a5a')); s.rect(7, 4, 2, 2, hexc('#c9cdd6'))
    s.ellipse(8, 10, 5 if big else 4.5, 5 if big else 4.5, hexc('#c9cdd6')); s.ellipse(8, 11, 4 if big else 3.5, 3.5, c); s.px(6, 8, hexc('#ffffff'))
    return s.finish()
RELIC_DRAW = {
    'knuckle': lambda s: [s.rect(3, 6, 10, 4, GOLD), [s.ellipse(4 + 3 * i, 5, 1.5, 1.5, GOLD) for i in range(4)], s.rect(5, 10, 6, 3, GOLD)],
    'snare': lambda s: [s.ellipse(8, 8, 6, 6, DSTEEL), s.ellipse(8, 8, 3, 3, CLEAR), [s.px(8 + 6 * math.cos(a), 8 + 6 * math.sin(a), STEEL) for a in (0, 1.6, 3.1, 4.7)]],
    'spade': lambda s: [s.rect(7, 1, 2, 8, WOOD), s.poly([(4, 9), (12, 9), (11, 14), (5, 14)], STEEL)],
    'gauze': lambda s: [s.poly([(2, 10), (10, 2), (14, 6), (6, 14)], hexc('#efe6d8')), s.line(5, 8, 8, 11, hexc('#c9473a')), s.line(8, 5, 11, 8, hexc('#c9473a'))],
    'leeches': lambda s: [s.rect(4, 4, 8, 10, hexc('#9ab0c4', 180)), s.rect(4, 3, 8, 2, WOOD), s.line(6, 9, 10, 11, hexc('#3a2a2a'), 2)],
    'rending': lambda s: [s.poly([(5, 2), (11, 2), (9, 14)], hexc('#efe6d8')), s.line(7, 4, 8, 10, hexc('#c9473a'))],
    'primed': lambda s: [s.rect(4, 6, 8, 7, SKIN), [s.rect(4 + 2 * i, 3, 2, 4, SKIN) for i in range(4)], s.px(12, 3, hexc('#ffd84a'))],
    'concuss': lambda s: [s.poly([(8, 2), (12, 6), (13, 12), (3, 12), (4, 6)], GOLD), s.rect(2, 12, 12, 2, GOLD), s.px(8, 14, WOOD)],
    'counter': lambda s: [s.line(2, 12, 14, 4, hexc('#5fd0ff'), 2), s.poly([(10, 2), (14, 4), (12, 8)], hexc('#5fd0ff'))],
    'bastion': lambda s: [s.poly([(3, 2), (13, 2), (13, 9), (8, 14), (3, 9)], hexc('#3f5f9a')), s.rect(7, 3, 2, 9, GOLD), s.rect(4, 6, 8, 2, GOLD)],
    'ratpaw': lambda s: [s.ellipse(8, 10, 4, 3, hexc('#c99a8a')), [s.ellipse(4 + 2.7 * i, 5, 1.2, 1.5, hexc('#c99a8a')) for i in range(4)]],
    'tortoise': lambda s: [s.ellipse(8, 9, 6, 4, hexc('#5a8a4a')), s.ellipse(8, 9, 3, 2, hexc('#7ab84a')), s.ellipse(14, 9, 1.5, 1.5, hexc('#7ab84a'))],
    'salt': lambda s: [s.rect(5, 4, 6, 10, hexc('#efe6d8')), s.rect(5, 2, 6, 2, DSTEEL), [s.px(6 + i % 3 * 2, 7 + i // 3 * 2, hexc('#9ab0c4')) for i in range(6)]],
    'journal': lambda s: [s.rect(3, 2, 10, 12, hexc('#6e2a3a')), s.rect(4, 3, 8, 10, hexc('#8a3a4a')), s.rect(6, 6, 4, 1, GOLD), s.rect(6, 8, 4, 1, GOLD)],
}
def icon_relic(k):
    s = Spr(16); RELIC_DRAW.get(k, RELIC_DRAW['knuckle'])(s); return s.finish()

DOOR_EMBLEM = {
    'fight': lambda s: [s.line(7, 7, 17, 17, STEEL, 2), s.line(17, 7, 7, 17, STEEL, 2)],
    'elite': lambda s: [s.ellipse(12, 11, 5, 5, hexc('#e6e0d0')), s.rect(9, 15, 6, 3, hexc('#e6e0d0')), s.px(10, 11, OUT), s.px(14, 11, OUT)],
    'boss': lambda s: [s.poly([(6, 16), (6, 8), (9, 11), (12, 6), (15, 11), (18, 8), (18, 16)], GOLD)],
    'treasure': lambda s: [s.rect(6, 10, 12, 8, hexc('#9a5a32')), s.rect(6, 9, 12, 3, hexc('#7a4a2a')), s.rect(11, 11, 2, 3, GOLD)],
    'vault': lambda s: [s.ellipse(12, 12, 6, 6, DSTEEL), s.ellipse(12, 12, 2, 2, GOLD), s.line(12, 6, 12, 18, STEEL)],
    'rest': lambda s: [s.line(7, 18, 17, 15, WOOD, 2), s.poly([(12, 5), (16, 12), (12, 16), (8, 12)], hexc('#ff8a2a')), s.ellipse(12, 13, 2, 2, hexc('#ffe08a'))],
    'shop': lambda s: [s.ellipse(12, 12, 5, 5, GOLD), s.rect(11, 9, 2, 6, hexc('#a07a2a'))],
    'merchant': lambda s: [s.ellipse(12, 13, 6, 5, hexc('#a07a3a')), s.rect(10, 6, 4, 3, hexc('#a07a3a')), s.ellipse(12, 13, 2, 2, GOLD)],
    'mystery': lambda s: [s.ellipse(12, 9, 4, 3, hexc('#c9a0ff')), s.rect(13, 9, 2, 3, CLEAR), s.rect(11, 12, 2, 3, hexc('#c9a0ff')), s.rect(11, 16, 2, 2, hexc('#c9a0ff'))],
    'armory': lambda s: [s.line(6, 18, 12, 6, STEEL, 2), s.line(18, 18, 12, 6, STEEL, 2)],
    'venom': lambda s: [s.poly([(12, 5), (16, 13), (12, 18), (8, 13)], hexc('#5cc35a'))],
    'purify': lambda s: [s.poly([(12, 5), (16, 13), (12, 18), (8, 13)], hexc('#5fd0ff')), s.px(11, 12, hexc('#ffffff'))],
    'trash': lambda s: [s.ellipse(12, 15, 7, 4, hexc('#7a6a5a')), s.rect(9, 9, 3, 4, DSTEEL), s.px(15, 11, GOLD)],
    'forge': lambda s: [s.rect(6, 11, 12, 3, DSTEEL), s.rect(9, 14, 6, 4, DSTEEL), s.poly([(18, 11), (21, 9), (18, 13)], DSTEEL), s.px(14, 8, hexc('#ff8a2a'))],
    'trainer': lambda s: [s.rect(6, 6, 12, 12, hexc('#7a4a2a')), s.rect(7, 7, 10, 10, hexc('#efe6d8')), s.rect(9, 9, 6, 1, OUT), s.rect(9, 12, 6, 1, OUT)],
    'wager': lambda s: [s.rect(7, 7, 10, 10, hexc('#efe6d8')), s.px(9, 9, OUT), s.px(14, 14, OUT), s.px(12, 12, OUT), s.px(14, 9, OUT), s.px(9, 14, OUT)],
}
def icon_door(k):
    s = Spr(24)
    s.ellipse(12, 9, 9, 8, hexc('#5a3a26')); s.rect(3, 9, 18, 14, hexc('#5a3a26'))
    s.ellipse(12, 9, 7, 6, hexc('#2a1c14')); s.rect(5, 9, 14, 14, hexc('#2a1c14'))
    s.finish(shade=True, outline=True)
    DOOR_EMBLEM.get(k, DOOR_EMBLEM['fight'])(s)
    return s
def ui_bits():
    out = {}
    s = Spr(16); s.ellipse(8, 8, 5, 5, GOLD); s.rect(7, 5, 2, 6, hexc('#a07a2a')); out['coin'] = s.finish()
    s = Spr(16); s.ellipse(5, 6, 3.5, 3.5, hexc('#e0404a')); s.ellipse(11, 6, 3.5, 3.5, hexc('#e0404a')); s.poly([(1.5, 7), (14.5, 7), (8, 14)], hexc('#e0404a')); s.px(4, 4, hexc('#ff9aa0')); out['heart'] = s.finish()
    s = Spr(16); s.ellipse(5, 6, 3.5, 3.5, hexc('#3a2a2a')); s.ellipse(11, 6, 3.5, 3.5, hexc('#3a2a2a')); s.poly([(1.5, 7), (14.5, 7), (8, 14)], hexc('#3a2a2a')); out['heart_empty'] = s.finish(shade=False)
    s = Spr(16); s.ellipse(8, 7, 6, 5, hexc('#e6e0d0')); s.rect(5, 11, 6, 3, hexc('#e6e0d0')); s.rect(5, 6, 2, 2, OUT); s.rect(9, 6, 2, 2, OUT); out['skull'] = s.finish()
    s = Spr(16); s.ellipse(8, 8, 7, 4, hexc('#efe6d8')); s.ellipse(8, 8, 3, 3, hexc('#5aa8ff')); s.ellipse(8, 8, 1, 1, OUT); out['eye'] = s.finish()
    s = Spr(16); s.poly([(2, 13), (2, 5), (5, 8), (8, 3), (11, 8), (14, 5), (14, 13)], GOLD); out['crown'] = s.finish()
    s = Spr(16); s.poly([(4, 2), (12, 2), (15, 6), (8, 15), (1, 6)], hexc('#e05a6a')); s.line(1, 6, 15, 6, mix(hexc('#e05a6a'), .3)); out['gem'] = s.finish()
    s = Spr(16); s.poly([(8, 2), (11, 7), (8, 14), (5, 7)], hexc('#c9473a')); out['blood'] = s.finish()
    s = Spr(16); s.ellipse(8, 9, 5, 5, hexc('#6f7dff')); s.px(6, 7, hexc('#ffffff')); out['mana'] = s.finish()
    s = Spr(16); s.rect(3, 4, 10, 9, hexc('#5cc35a')); s.rect(3, 4, 10, 2, hexc('#3f8a3a')); out['poison'] = s.finish()
    return out

# ---------------------------------------------------------------- UI frames and the arena floor
def frame(fill, edge, light, size=16, b=4, notch=True):
    s = Spr(size)
    s.rect(0, 0, size, size, edge); s.rect(1, 1, size - 2, size - 2, light); s.rect(2, 2, size - 4, size - 4, fill)
    if notch:
        for (x, y) in ((0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)): s.px(x, y, CLEAR)
    return s
def floor():
    s = Spr(32); base = hexc('#2a221c')
    s.rect(0, 0, 32, 32, base)
    for (x, y, w, h) in ((0, 0, 16, 8), (16, 0, 16, 8), (8, 8, 16, 8), (24, 8, 8, 8), (0, 8, 8, 8), (0, 16, 16, 8), (16, 16, 16, 8), (8, 24, 16, 8), (24, 24, 8, 8), (0, 24, 8, 8)):
        s.rect(x + 1, y + 1, w - 1, h - 1, mix(base, .06 * ((x * 7 + y * 3) % 3)))
        s.rect(x, y, w, 1, mix(base, -.35)); s.rect(x, y, 1, h, mix(base, -.35))
    return s
def torch():
    s = Spr(16, 24); s.rect(7, 10, 2, 13, WOOD); s.rect(6, 9, 4, 2, DSTEEL)
    s.poly([(8, 0), (11, 6), (9, 9), (7, 9), (5, 6)], hexc('#ff8a2a')); s.ellipse(8, 6, 1.5, 2, hexc('#ffe08a'))
    return s.finish(shade=False)

def main():
    for k in ('plain', 'warrior', 'mage', 'archer', 'paladin', 'rogue'):
        hero(k).save(f'heroes/{"hero" if k == "plain" else "hero_" + k}.png')
    W = ['daggers', 'saber', 'swordShield', 'longsword', 'greatAxe', 'greatHammer', 'mace', 'maceShield', 'shortbow', 'longbow', 'wandFocus', 'staff']
    for w in W:
        sp = weapon(w); sp.save(f'weapons/{w}.png'); icon_from(weapon(w)).save(f'icons/{w}.png')
    for m in ['rat', 'slime', 'slimeElite', 'wolf', 'snake', 'hydra', 'skeleton', 'skeletonArcher', 'disciple', 'goblin', 'thief', 'orc', 'golem', 'wraith', 'troll', 'ogre',
              'cultist', 'ghoul', 'jester', 'boneKing', 'gorehorn', 'warden', 'yeti', 'wraithKing', 'alphaWolf', 'occultist', 'mire']:
        monster(m).save(f'monsters/{m}.png')
    for k in ('weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots'): icon_slot(k).save(f'icons/{k}.png')
    for k in list(POTION) + ['tome', 'dye']: icon_potion(k).save(f'icons/potion_{k}.png')
    for k in RELIC_DRAW: icon_relic(k).save(f'icons/relic_{k}.png')
    for k in DOOR_EMBLEM: icon_door(k).save(f'icons/door_{k}.png')
    for k, sp in ui_bits().items(): sp.save(f'icons/{k}.png')
    frame(hexc('#1f1915'), hexc('#0e0b09'), hexc('#3d322a')).save('ui/panel.png', 2)
    frame(hexc('#2a221c'), hexc('#0e0b09'), hexc('#4d3f33')).save('ui/card.png', 2)
    frame(hexc('#4a2e18'), hexc('#0e0b09'), hexc('#a8642a')).save('ui/button.png', 2)
    frame(hexc('#5e3a1e'), hexc('#0e0b09'), hexc('#e8903f')).save('ui/button_hover.png', 2)
    frame(hexc('#3a2412'), hexc('#0e0b09'), hexc('#7a4a22')).save('ui/button_pressed.png', 2)
    frame(hexc('#26201b'), hexc('#0e0b09'), hexc('#3a322b')).save('ui/button_disabled.png', 2)
    frame(hexc('#221c17'), hexc('#0e0b09'), hexc('#4d3f33')).save('ui/button_ghost.png', 2)
    floor().save('ui/floor.png'); torch().save('ui/torch.png')
    print('art written to', os.path.normpath(ROOT))

if __name__ == '__main__':
    main()
