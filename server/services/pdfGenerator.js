const PDFDocument = require('pdfkit');

/**
 * Generates a clean, professional PDF stream for a payslip.
 * 
 * @param {Object} payslip - The payslip record with employee and items
 * @param {Object} employee - The employee details
 * @param {Array} items - The line items for this payslip
 * @param {Object} run - The payroll run metadata
 * @returns {PDFDocument} - PDFKit document instance (readable stream)
 */
function generatePayslipPDF({ payslip, employee, items = [], run = {} }) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Payslip_${employee.name.replace(/\s+/g, '_')}_${payslip.month}`,
      Author: 'Employee Management System',
      Subject: `Monthly Payslip for ${payslip.month}`
    }
  });

  const primaryColor = '#1e1b4b'; // Deep Indigo
  const slateColor = '#475569';
  const lightBg = '#f8fafc';
  const borderColor = '#e2e8f0';

  // --- Header ---
  doc.rect(40, 40, 515, 65).fill(lightBg);
  doc.rect(40, 40, 515, 65).stroke(borderColor);

  doc
    .fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('EMPLOYEE MANAGEMENT SYSTEM', 55, 52);

  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor(slateColor)
    .text('Confidential Official Salary Disbursement Voucher', 55, 72)
    .text('Currency: Pakistani Rupee (PKR)', 55, 84);

  // Status Badge on Top Right
  const status = (payslip.status || 'Draft').toUpperCase();
  const statusX = 420;
  doc.rect(statusX, 55, 115, 22).fill(status === 'LOCKED' ? '#065f46' : status === 'APPROVED' ? '#1e40af' : '#b45309');
  doc
    .fillColor('#ffffff')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`STATUS: ${status}`, statusX + 8, 61, { width: 100, align: 'center' });

  // Month & Voucher Info
  doc
    .fillColor(slateColor)
    .fontSize(8)
    .font('Helvetica')
    .text(`Period: ${payslip.month} | Ref: PS-${payslip.id}`, statusX, 83, { width: 115, align: 'right' });

  let y = 120;

  // --- Employee Information Card ---
  doc.rect(40, y, 515, 75).fill('#ffffff').stroke(borderColor);

  doc
    .fillColor(primaryColor)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('EMPLOYEE INFORMATION', 55, y + 10);

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Employee Name:', 55, y + 28)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(employee.name || 'N/A', 145, y + 28)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Designation:', 55, y + 43)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(employee.designation || 'N/A', 145, y + 43)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Department:', 55, y + 58)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(employee.department_name || 'General', 145, y + 58);

  doc
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Employee ID:', 320, y + 28)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(`EMP-${String(employee.id).padStart(4, '0')}`, 410, y + 28)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Email Address:', 320, y + 43)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(employee.email || 'N/A', 410, y + 43)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Payable Days:', 320, y + 58)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(`${payslip.payable_days} / ${payslip.working_days_in_month} working days`, 410, y + 58);

  y += 90;

  // --- Rate Metrics Mini Bar ---
  doc.rect(40, y, 515, 28).fill(lightBg).stroke(borderColor);
  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text(`Basic Salary: PKR ${Number(payslip.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 55, y + 9)
    .text(`Daily Rate: PKR ${Number(payslip.daily_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 220, y + 9)
    .text(`Hourly Rate: PKR ${Number(payslip.hourly_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 385, y + 9);

  y += 40;

  // --- Breakdown Table Header ---
  doc.rect(40, y, 515, 24).fill(primaryColor);
  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .font('Helvetica-Bold')
    .text('CATEGORY / DESCRIPTION', 55, y + 7)
    .text('RATE / QTY', 340, y + 7)
    .text('AMOUNT (PKR)', 455, y + 7, { align: 'right', width: 90 });

  y += 24;

  // Filter items
  const earnings = items.filter(i => i.category === 'EARNING');
  const deductions = items.filter(i => i.category === 'DEDUCTION');
  const adjustments = items.filter(i => i.category === 'ADJUSTMENT');

  const renderItemRow = (item, isDeduction = false) => {
    const rowBg = y % 2 === 0 ? '#ffffff' : '#fafafa';
    doc.rect(40, y, 515, 20).fill(rowBg).stroke(borderColor);

    let rateQtyText = '-';
    if (item.rate && item.quantity) {
      rateQtyText = `${item.quantity} @ ${Number(item.rate).toFixed(2)}`;
    } else if (item.quantity) {
      rateQtyText = `${item.quantity} unit(s)`;
    }

    doc
      .fontSize(8.5)
      .font('Helvetica')
      .fillColor('#1e293b')
      .text(item.description, 55, y + 5, { width: 275, ellipsis: true })
      .fillColor(slateColor)
      .text(rateQtyText, 340, y + 5);

    const sign = isDeduction ? '-' : '+';
    const amountColor = isDeduction ? '#b91c1c' : '#15803d';

    doc
      .font('Helvetica-Bold')
      .fillColor(amountColor)
      .text(`${sign} ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 455, y + 5, {
        align: 'right',
        width: 90
      });

    y += 20;
  };

  // Render Earnings
  doc.rect(40, y, 515, 18).fill('#f1f5f9').stroke(borderColor);
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('EARNINGS & ALLOWANCES', 55, y + 4);
  y += 18;

  if (earnings.length === 0) {
    renderItemRow({ description: 'None', amount: 0, rate: null, quantity: null }, false);
  } else {
    for (const item of earnings) {
      renderItemRow(item, false);
    }
  }

  // Render Deductions
  doc.rect(40, y, 515, 18).fill('#f1f5f9').stroke(borderColor);
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#991b1b').text('DEDUCTIONS & WITHHOLDINGS', 55, y + 4);
  y += 18;

  if (deductions.length === 0) {
    renderItemRow({ description: 'No Deductions', amount: 0, rate: null, quantity: null }, true);
  } else {
    for (const item of deductions) {
      renderItemRow(item, true);
    }
  }

  // Render Adjustments if any
  if (adjustments.length > 0) {
    doc.rect(40, y, 515, 18).fill('#f1f5f9').stroke(borderColor);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0369a1').text('RETROACTIVE ADJUSTMENTS', 55, y + 4);
    y += 18;

    for (const item of adjustments) {
      renderItemRow(item, Number(item.amount) < 0);
    }
  }

  y += 10;

  // --- Totals Summary Box ---
  doc.rect(40, y, 515, 65).fill(lightBg).stroke(borderColor);

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(slateColor)
    .text('Gross Earnings:', 55, y + 10)
    .fillColor('#15803d')
    .text(`PKR ${Number(payslip.gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 160, y + 10)
    .fillColor(slateColor)
    .text('Total Deductions:', 55, y + 26)
    .fillColor('#b91c1c')
    .text(`- PKR ${Number(payslip.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 160, y + 26)
    .fillColor(slateColor)
    .text('Net Adjustments:', 55, y + 42)
    .fillColor('#0284c7')
    .text(`PKR ${Number(payslip.adjustments_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 160, y + 42);

  // Highlight Net Pay Box
  doc.rect(300, y + 8, 240, 49).fill(primaryColor);
  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .font('Helvetica')
    .text('NET SALARY PAYABLE', 315, y + 14)
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(`PKR ${Number(payslip.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 315, y + 30);

  y += 85;

  // --- Signatures Section ---
  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(slateColor)
    .text('This payslip is a system-generated document under the company Enterprise Management System.', 55, y)
    .text('All working days, leaves, overtime hours, and deductions are cross-referenced with digital attendance logs.', 55, y + 12);

  y += 45;

  doc.strokeColor(borderColor);
  doc.moveTo(55, y).lineTo(185, y).stroke();
  doc.moveTo(230, y).lineTo(360, y).stroke();
  doc.moveTo(405, y).lineTo(535, y).stroke();

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(slateColor)
    .text('Prepared By (HR)', 55, y + 5, { width: 130, align: 'center' })
    .text('Authorized By (Admin)', 230, y + 5, { width: 130, align: 'center' })
    .text('Employee Signature', 405, y + 5, { width: 130, align: 'center' });

  doc.end();
  return doc;
}

module.exports = {
  generatePayslipPDF
};
