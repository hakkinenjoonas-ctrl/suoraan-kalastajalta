export function groupConsumerCommissionReservations(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.reservation_group_id || row.id;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { id: key, rows: [] });
    groups.get(key).rows.push(row);
  });
  return Array.from(groups.values()).map((group) => {
    const first = group.rows[0];
    return {
      ...first,
      id: group.id,
      rows: group.rows,
      lines: group.rows.map((row) => `${Number(row.unit_count || 0)} × ${row.variant_label || "tuote"}`),
      totalIncludingVat: Number(group.rows.reduce((sum, row) => sum + Number(row.total_including_vat || 0), 0).toFixed(2)),
      netTradeValue: Number(group.rows.reduce((sum, row) => sum + Number(row.net_trade_value || 0), 0).toFixed(2)),
      commissionAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0).toFixed(2)),
    };
  });
}
