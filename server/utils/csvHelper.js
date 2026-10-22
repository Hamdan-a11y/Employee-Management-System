/**
 * RFC 4180 compliant CSV Parser & Generator
 */

function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove leading UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [''];
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote: "" inside quoted field
        currentRow[currentRow.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      // Only keep rows that have content or multiple columns
      const hasContent = currentRow.some((val) => val.trim() !== '');
      if (hasContent) {
        rows.push(currentRow.map((val) => val.trim()));
      }
      currentRow = [''];
    } else {
      currentRow[currentRow.length - 1] += char;
    }
  }

  const hasContent = currentRow.some((val) => val.trim() !== '');
  if (hasContent) {
    rows.push(currentRow.map((val) => val.trim()));
  }

  return rows;
}

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(headers, rows) {
  const headerLine = headers.map(escapeCSVField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCSVField).join(','));
  // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

module.exports = {
  parseCSV,
  escapeCSVField,
  generateCSV
};
