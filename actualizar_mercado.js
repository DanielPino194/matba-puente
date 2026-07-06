// Baja instrumentos agro + market data de MATBA ROFEX (reMarkets) y guarda datos/mercado_live.json
// Credenciales por variables de entorno: MATBA_USER, MATBA_PASS (GitHub Secrets)
const fs = require('fs');

const BASE = 'https://api.remarkets.primary.com.ar';
const ENTRIES = 'LA,BI,OF,CL,SE,OI,NV';
// prefijos de subyacentes agro de MATBA + dólar
const AGRO = /^(SOJ|TRI|MAI|GIR|CEB|SOR|DLR)/i;

async function getToken() {
  const res = await fetch(BASE + '/auth/getToken', {
    method: 'POST',
    headers: { 'X-Username': process.env.MATBA_USER, 'X-Password': process.env.MATBA_PASS },
  });
  if (!res.ok) throw new Error('auth ' + res.status);
  const t = res.headers.get('x-auth-token');
  if (!t) throw new Error('sin token');
  return t;
}

async function main() {
  const token = await getToken();
  const H = { 'X-Auth-Token': token };

  // 1. instrumentos
  const ri = await fetch(BASE + '/rest/instruments/details', { headers: H });
  if (!ri.ok) throw new Error('instruments ' + ri.status);
  const di = await ri.json();
  const instrumentos = (di.instruments || [])
    .filter(i => AGRO.test(i.instrumentId?.symbol || ''))
    .map(i => ({
      symbol: i.instrumentId.symbol,
      maturityDate: i.maturityDate,
      currency: i.currency,
      strike: i.strikePrice ?? null,
      putOrCall: i.putOrCall ?? null, // FIX: 0=put, 1=call
    }));
  console.log('instrumentos agro:', instrumentos.length);

  // 2. market data de cada uno (en tandas para no saturar)
  const md = {};
  const LOTE = 8;
  for (let i = 0; i < instrumentos.length; i += LOTE) {
    const tanda = instrumentos.slice(i, i + LOTE);
    await Promise.all(tanda.map(async inst => {
      try {
        const r = await fetch(
          `${BASE}/rest/marketdata/get?marketId=ROFX&symbol=${encodeURIComponent(inst.symbol)}&entries=${ENTRIES}&depth=1`,
          { headers: H });
        if (r.ok) {
          const j = await r.json();
          if (j.status === 'OK' && j.marketData) md[inst.symbol] = j.marketData;
        }
      } catch (e) { /* símbolo sin data: seguir */ }
    }));
  }
  console.log('con market data:', Object.keys(md).length);

  const out = {
    actualizado: new Date().toISOString(),
    fuente: 'MATBA ROFEX vía reMarkets (Primary)',
    instrumentos,
    marketdata: md,
  };
  fs.mkdirSync('datos', { recursive: true });
  fs.writeFileSync('datos/mercado_live.json', JSON.stringify(out));
  console.log('guardado datos/mercado_live.json');
}

main().catch(e => { console.error(e); process.exit(1); });
