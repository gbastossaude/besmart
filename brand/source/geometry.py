# Geometria exata do símbolo ERBE (escudo-E). Curvas cúbicas divididas por de Casteljau.
# Exact geometry for the ERBE "E-shield" symbol.
def lerp(a,b,t): return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)
def split(c,t):
    p0,p1,p2,p3=c
    a=lerp(p0,p1,t); b=lerp(p1,p2,t); cc=lerp(p2,p3,t)
    d=lerp(a,b,t); e=lerp(b,cc,t); f=lerp(d,e,t)
    return (p0,a,d,f),(f,e,cc,p3)
def pt(c,t): return split(c,t)[0][3]
def t_at_y(c,y):
    lo,hi=0.0,1.0
    for _ in range(60):
        m=(lo+hi)/2
        if pt(c,m)[1]<y: lo=m
        else: hi=m
    return (lo+hi)/2
def f(v): return f'{v:.3f}'.rstrip('0').rstrip('.')
def P(p,ox,oy): return f'{f(p[0]+ox)} {f(p[1]+oy)}'
def symbol(W=46,hs=14,ys=56,H=114,k1=28,k2=(26,11),sx=-20,slits=((34,41),(66,73)),ox=0,oy=0,notch=None):
    right=((W,ys),(W,ys+k1),(k2[0],H-k2[1]),(0,H))
    (s1a,s1b),(s2a,s2b)=slits
    d=[f'M{P((0,0),ox,oy)}',f'L{P((W,hs),ox,oy)}',f'L{P((W,s1a),ox,oy)}',f'L{P((sx,s1a),ox,oy)}',f'L{P((sx,s1b),ox,oy)}']
    if notch:  # shorten middle arm: arm ends at x=notch
        d+= [f'L{P((notch,s1b),ox,oy)}',f'L{P((notch,s2a),ox,oy)}']
    else:
        d+= [f'L{P((W,s1b),ox,oy)}']
    def C(c): return f'C{P(c[1],ox,oy)} {P(c[2],ox,oy)} {P(c[3],ox,oy)}'
    if s2b<=ys:
        if not notch: d.append(f'L{P((W,s2a),ox,oy)}')
        d+=[f'L{P((sx,s2a),ox,oy)}',f'L{P((sx,s2b),ox,oy)}',f'L{P((W,s2b),ox,oy)}',f'L{P((W,ys),ox,oy)}',C(right)]
    else:
        ta=t_at_y(right,s2a); tb=t_at_y(right,s2b)
        A,rest=split(right,ta)
        if not notch: d+=[f'L{P((W,ys),ox,oy)}',C(A)]
        _,Bc=split(right,tb)
        d+=[f'L{P((sx,s2a),ox,oy)}',f'L{P((sx,s2b),ox,oy)}',f'L{P(Bc[0],ox,oy)}',C(Bc)]
    # left side: mirror of right curve, reversed
    L=[(-x,y) for x,y in reversed(right)]
    d+=[C(L),f'L{P((-W,hs),ox,oy)}','Z']
    return ' '.join(d)
