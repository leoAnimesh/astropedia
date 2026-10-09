/**
 * "Save as PDF": report HTML (./pdf.ts) → expo-print → system share sheet.
 *
 * expo-print is a native module: it needs a dev build / store build made
 * after it was added (npx expo run:ios / run:android, or EAS). On an older
 * build the import fails and the caller shows "needs the latest app build".
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist';
import { reportHtml, type PdfFonts, type PdfLabels } from './pdf';
import type { ReportPayload } from './types';

let fontsPromise: Promise<PdfFonts> | null = null;

async function base64Of(mod: number): Promise<string | undefined> {
  try {
    const asset = Asset.fromModule(mod);
    await asset.downloadAsync();
    if (!asset.localUri) return undefined;
    return await new File(asset.localUri).base64();
  } catch {
    return undefined; // the system fonts in the stack take over
  }
}

/** The app's Latin fonts as base64, read once per launch. */
function loadFonts(): Promise<PdfFonts> {
  fontsPromise ??= (async () => {
    const [serif, serifItalic, sans, sansMedium] = await Promise.all([
      base64Of(InstrumentSerif_400Regular),
      base64Of(InstrumentSerif_400Regular_Italic),
      base64Of(Geist_400Regular),
      base64Of(Geist_500Medium),
    ]);
    return { serif, serifItalic, sans, sansMedium };
  })();
  return fontsPromise;
}

export type PdfResult = 'shared' | 'unavailable' | 'failed';

export async function shareReportPdf(report: ReportPayload, labels: PdfLabels, accent: string): Promise<PdfResult> {
  let Print: typeof import('expo-print');
  try {
    Print = await import('expo-print');
  } catch {
    return 'unavailable';
  }
  try {
    const html = reportHtml(report, labels, { accent, fonts: await loadFonts() });
    // A4 in points.
    const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: labels.heading });
    }
    return 'shared';
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/native module|ExpoPrint|Cannot find/i.test(msg)) return 'unavailable';
    console.warn('[reports] pdf failed', e);
    return 'failed';
  }
}
