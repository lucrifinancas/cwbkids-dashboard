// Leitura das tabelas nativas D1 com os cabecalhos usados pelos dashboards.
export function metricRows(spec, records, formatted = false) {
  return records.map(record => Object.fromEntries(spec.headers.map((header, i) => {
    const field = spec.fields[i];
    let value = record[field];
    if (value == null) value = '';
    else if (field === 'data' && formatted) {
      const [year, month, day] = value.split('-');
      value = `${day}/${month}/${year}`;
    } else if (field === 'destino_link') value = value ? 'SIM' : 'NÃO';
    else if (spec.percent.includes(field)) value = formatted ? `${value}%` : value / 100;
    return [header, value];
  })));
}

export async function readMetricTable(db, spec, from = null, to = null) {
  const filters = [], params = [];
  if (from) { filters.push('data >= ?'); params.push(from); }
  if (to) { filters.push('data <= ?'); params.push(to); }
  const order = ['data', ...spec.keys.filter(k => k !== 'data')].join(',');
  const sql = `SELECT * FROM ${spec.table}${filters.length ? ' WHERE ' + filters.join(' AND ') : ''} ORDER BY ${order}`;
  const { results } = await db.prepare(sql).bind(...params).all();
  return results;
}
