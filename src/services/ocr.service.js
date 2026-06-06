const { ai, MODEL_NAME } = require('../config/gemini');

const PROMPT = `Você é um assistente especializado em leitura de notas fiscais e comprovantes de pagamento brasileiros.
Extraia TODOS os dados desta imagem de nota fiscal ou comprovante de cartão.
Retorne no formato JSON estruturado com os seguintes campos:

- store_name: nome do estabelecimento/loja
- date: data da compra no formato YYYY-MM-DD
- time: horário da compra no formato HH:MM
- items: array de objetos com { name: string, qty: number, price: number }
- total: valor total numérico (apenas o número, sem R$)
- payment_method: método de pagamento (dinheiro, credito, debito, pix, outro)
- document_type: tipo do documento (nota_fiscal, recibo_cartao_credito, recibo_cartao_debito, outro)
- full_text: transcrição completa de todo o texto visível na imagem

Se algum campo não puder ser identificado, retorne null para ele.
Valores monetários devem ser números decimais (ex: 29.90).`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    store_name: { type: 'string', nullable: true },
    date: { type: 'string', nullable: true },
    time: { type: 'string', nullable: true },
    items: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          price: { type: 'number' },
        },
        required: ['name', 'qty', 'price'],
      },
    },
    total: { type: 'number', nullable: true },
    payment_method: { type: 'string', nullable: true },
    document_type: { type: 'string', nullable: true },
    full_text: { type: 'string', nullable: true },
  },
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractReceiptData(imageBuffer, mimeType) {
  const base64Image = imageBuffer.toString('base64');
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
              { text: PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return { full_text: null, error: 'Resposta vazia do OCR' };
      }

      const parsed = JSON.parse(text);

      if (parsed.document_type) {
        const validTypes = ['nota_fiscal', 'recibo_cartao_credito', 'recibo_cartao_debito', 'outro'];
        if (!validTypes.includes(parsed.document_type)) {
          parsed.document_type = 'outro';
        }
      }

      if (parsed.payment_method) {
        const methodMap = {
          'credito': 'credito',
          'crédito': 'credito',
          'credit': 'credito',
          'debito': 'debito',
          'débito': 'debito',
          'debit': 'debito',
          'dinheiro': 'dinheiro',
          'cash': 'dinheiro',
          'pix': 'pix',
        };
        parsed.payment_method = methodMap[parsed.payment_method.toLowerCase()] || parsed.payment_method;
      }

      return parsed;
    } catch (err) {
      const status = err.status || err.httpStatusCode || err.code;

      if (status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        await sleep(delay);
        continue;
      }

      if (attempt === maxRetries - 1) {
        console.error('OCR falhou após todas as tentativas:', err.message);
        return { full_text: null, error: 'OCR failed' };
      }
    }
  }

  return { full_text: null, error: 'OCR failed' };
}

module.exports = { extractReceiptData };
