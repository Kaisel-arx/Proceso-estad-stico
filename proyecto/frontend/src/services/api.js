const API_URL = 'http://localhost:3001/api';

export async function obtenerLotes() {
  const res = await fetch(`${API_URL}/lotes`);
  if (!res.ok) throw new Error('Error al obtener los lotes');
  return res.json();
}

export async function guardarLote(lote) {
  const res = await fetch(`${API_URL}/lotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lote),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Error al guardar el lote');
  }
  return res.json();
}

export async function obtenerLotePorId(id) {
  const res = await fetch(`${API_URL}/lotes/${id}`);
  if (!res.ok) throw new Error('Error al obtener el lote');
  return res.json();
}

export async function obtenerEstadisticos(loteId) {
  const res = await fetch(`${API_URL}/lotes/${loteId}/stats`);
  if (!res.ok) throw new Error('Error al obtener los estadisticos');
  return res.json();
}