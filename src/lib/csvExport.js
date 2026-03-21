/**
 * Télécharge un tableau de données en fichier CSV.
 * Le BOM UTF-8 (\ufeff) assure l'ouverture correcte dans Excel.
 * @param {string} filename  Nom du fichier sans extension
 * @param {string[]} headers Entêtes de colonnes
 * @param {Array[]} rows     Tableau de lignes (chaque ligne est un tableau de valeurs)
 */
export function downloadCSV(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
