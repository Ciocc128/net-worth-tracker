// lib/utils/pdfGenerator.ts
// PDF generation orchestrator - main entry point

import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { PDFDocument } from '@/components/pdf/PDFDocument';
import { fetchPDFData } from '@/lib/services/pdfDataService';
import type { PDFGenerateOptions, PDFDataContext } from '@/types/pdf';

/**
 * Main PDF generation function
 *
 * Orchestrates the entire PDF generation process:
 * 1. Fetch and prepare data
 * 2. Generate PDF
 * 3. Download file
 *
 * @param options - PDF generation configuration
 * @throws Error if generation fails
 */
export async function generatePDF(options: PDFGenerateOptions): Promise<void> {
  console.log('Starting PDF generation...', {
    sections: options.sections,
    timeFilter: options.timeFilter || 'total',
    snapshotCount: options.snapshots.length,
  });

  try {
    // Step 1: Prepare data context
    const context: PDFDataContext = {
      userId: options.userId,
      userName: options.userName,
      generatedAt: new Date(),
      snapshots: options.snapshots,
      assets: options.assets,
      allocationTargets: options.allocationTargets,
      timeFilter: options.timeFilter,
      selectedYear: options.selectedYear,
      selectedMonth: options.selectedMonth,
    };

    // Step 2: Fetch and prepare section data
    console.log('Fetching PDF data...');
    const data = await fetchPDFData(
      options.userId,
      context,
      options.sections,
      options.timeFilter,
      options.selectedYear,
      options.selectedMonth
    );

    console.log('Data fetched successfully');

    // Step 3: Generate PDF
    console.log('Generating PDF document...');
    const blob = await pdf(
      <PDFDocument
        data={data}
        context={context}
        sections={options.sections}
      />
    ).toBlob();

    console.log(`PDF generated: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    // Step 4: Download file
    const fileName = `portfolio-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`PDF downloaded: ${fileName}`);

    URL.revokeObjectURL(url);

    console.log('PDF generation complete!');

  } catch (error) {
    console.error('PDF generation failed:', error);

    throw new Error('Impossibile generare il PDF. Riprova più tardi.');
  }
}

/**
 * Validate PDF generation options
 *
 * @param options - Options to validate
 * @returns true if valid
 * @throws Error with descriptive message if invalid
 */
export function validatePDFOptions(options: PDFGenerateOptions): boolean {
  if (!options.userId || options.userId.trim() === '') {
    throw new Error('User ID is required');
  }

  if (!options.userName || options.userName.trim() === '') {
    throw new Error('User name is required');
  }

  // Check if at least one section is selected
  const selectedSections = Object.values(options.sections).filter(Boolean);
  if (selectedSections.length === 0) {
    throw new Error('Seleziona almeno una sezione da includere nel PDF');
  }

  // Validate assets array (required for portfolio/allocation)
  if (options.sections.portfolio || options.sections.allocation) {
    if (!Array.isArray(options.assets)) {
      throw new Error('Assets array is required for selected sections');
    }
  }

  // Validate snapshots array (required for history)
  if (options.sections.history) {
    if (!Array.isArray(options.snapshots)) {
      throw new Error('Snapshots array is required for history section');
    }

    // Require minimum 2 snapshots for history section
    if (options.snapshots.length < 2) {
      throw new Error('Sono richiesti almeno 2 snapshot per la sezione Storico');
    }
  }

  return true;
}
