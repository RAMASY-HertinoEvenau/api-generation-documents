import PDFDocument from "pdfkit";
import { RenderPdfTaskPayload } from "../types/pdfWorker";

interface CompiledPdfTemplate {
  name: string;
  compiledAt: string;
  render: (document: PDFKit.PDFDocument, payload: RenderPdfTaskPayload) => void;
}

const templateCache = new Map<string, CompiledPdfTemplate>();

function compileTemplate(name: string): CompiledPdfTemplate {
  const compiledAt = new Date().toISOString();
  const staticSections = [
    "Document genere en pipeline haute performance.",
    "Template compile une seule fois puis reutilise par worker thread.",
    "Flux PDF diffuse directement vers GridFS sans buffer global en memoire."
  ];

  return {
    name,
    compiledAt,
    render(document, payload) {
      document.fontSize(24).text("ProcessIQ Document Service", {
        align: "center"
      });
      document.moveDown(0.5);
      document.fontSize(14).text(`Template: ${name}`);
      document.text(`Compile le: ${compiledAt}`);
      document.moveDown();

      document.fontSize(16).text("Informations du document", {
        underline: true
      });
      document.moveDown(0.5);
      document.fontSize(12).text(`Batch ID: ${payload.batchId}`);
      document.text(`Document ID: ${payload.documentId}`);
      document.text(`User ID: ${payload.userId}`);
      document.text(`Genere le: ${new Date().toISOString()}`);
      document.moveDown();

      document.fontSize(16).text("Caracteristiques techniques", {
        underline: true
      });
      document.moveDown(0.5);

      for (const section of staticSections) {
        document.fontSize(12).text(`- ${section}`);
      }

      document.moveDown();
      document.fontSize(12).text(
        "Ce rendu PDF est volontairement simple et peut etre remplace par une generation CERFA ou convention plus riche."
      );
    }
  };
}

export function getCompiledPdfTemplate(name: string): CompiledPdfTemplate {
  const existingTemplate = templateCache.get(name);

  if (existingTemplate) {
    return existingTemplate;
  }

  const compiledTemplate = compileTemplate(name);
  templateCache.set(name, compiledTemplate);
  return compiledTemplate;
}

export function renderPdfDocument(document: PDFKit.PDFDocument, payload: RenderPdfTaskPayload): string {
  const template = getCompiledPdfTemplate(payload.templateName);
  template.render(document, payload);
  return template.name;
}
