import json,sys
d=json.load(sys.stdin)
rtl = d['real']['dir']=='rtl'
for k,m in [('real',d['real'])]+list(d['long'].items()):
    a,dk,p,l=m['amount'],m['dock'],m['pay'],m['label']
    fits = (a['l']>=dk['r']-0.5 and a['l']>=0) if rtl else (a['r']<=dk['l']+0.5)
    payin = p['l']>=0 and p['r']<=m['iw']
    lab_above = l['b']<=a['t']+1
    ok = m['lines']==1 and m['aSW']<=m['aCW']+0 and fits and payin and p['h']>=54 and m['payOnTop'] and dk['w']>=44 and dk['h']>=44 and m['sw']<=m['iw'] and lab_above
    print('OK ' if ok else 'BAD', k.ljust(14), 'lines',m['lines'],'sw/cw',m['aSW'],m['aCW'],'fs',m['fs'],'amt',a['l'],a['r'],'dock',dk['l'],dk['r'],'pay',p['l'],p['r'],p['h'],'fits',fits,'payin',payin,'top',m['payOnTop'],'pagesw',m['sw'],m['iw'])
