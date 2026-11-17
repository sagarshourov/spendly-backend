export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  // Checks endpoint availability; the OCR worker initializes on the first scan.
  response.end(JSON.stringify({ ready: true, engine: 'tesseract', version: '1.1.0' }));
}
