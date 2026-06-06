# NotaVault — Digital Receipt Vault 🔒

> **Version 0.1 (Alpha)** | Full-stack receipt management system with Gemini AI OCR

A secure web application for capturing, transcribing (via Google Gemini AI), and managing invoices and credit/debit card receipts. Features include MFA (TOTP), advanced filtering, scheduled email reports, and a cybersecurity-themed dark UI.

---

# NotaVault — Cofre Digital de Notas e Recibos 🔒

> **Versão 0.1 (Alpha)** | Sistema full-stack de gerenciamento de notas fiscais com OCR via Gemini AI

Aplicação web segura para captura, transcrição (via Google Gemini AI) e gerenciamento de notas fiscais e comprovantes de cartão de crédito/débito. Inclui MFA (TOTP), filtros avançados, relatórios por email agendados e interface dark mode estilo cybersecurity.

---

## Features / Funcionalidades

| Feature | Description / Descrição |
|---|---|
| 📸 **Photo Capture** | Take photos of receipts directly from camera or upload files / Tire fotos de notas direto da câmera ou envie arquivos |
| 🤖 **AI OCR** | Automatic text extraction with Google Gemini AI / Extração automática de texto com Google Gemini AI |
| 🔒 **MFA (TOTP)** | Optional two-factor auth via Google Authenticator/Authy / Autenticação em dois fatores opcional |
| 📊 **Advanced Filters** | Filter by date, value, store, type with sortable table / Filtros por data, valor, estabelecimento, tipo com tabela ordenável |
| 📧 **Email Reports** | Daily (23h) and monthly reports / Relatórios diários (23h) e mensais por email |
| 👤 **Admin Panel** | User management, approval workflow / Painel admin com gestão de usuários |
| 🛡️ **Security** | Bcrypt, JWT, rate limiting, SQL injection protection / Bcrypt, JWT, rate limiting, proteção contra SQL injection |
| 🗜️ **Image Optimization** | SHA-256 dedup, WebP compression / Deduplicação SHA-256, compressão WebP |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript |
| Backend | Node.js + Express.js |
| Database | SQLite (better-sqlite3) |
| AI/OCR | Google Gemini API (gemini-2.5-flash) |
| Auth | JWT + bcrypt + TOTP (otpauth) |
| Email | Nodemailer (Gmail SMTP) |
| Images | sharp (compression) + multer (upload) |
| Deploy | Docker + Docker Compose |

## Setup / Configuração

### Prerequisites / Pré-requisitos
- Node.js >= 18.x (local) or Docker (production)
- Google AI Studio API Key ([aistudio.google.com](https://aistudio.google.com))
- Gmail App Password ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords))

### Local Installation / Instalação Local

```bash
git clone <repository-url>
cd NotaVault
cp .env.example .env
# Edit .env with your credentials / Edite o .env com suas credenciais
npm install
npm start
```

### Docker Deployment / Deploy com Docker

```bash
git clone <repository-url>
cd NotaVault
cp .env.example .env
# Edit .env with your credentials / Edite o .env com suas credenciais
docker compose up -d --build
```

Persistent data is stored in `./data/` (database) and `./uploads/` (images).
Dados persistentes ficam em `./data/` (banco) e `./uploads/` (imagens).

### Environment Variables / Variáveis de Ambiente

Copy `.env.example` to `.env` and fill in:
Copie `.env.example` para `.env` e preencha:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `JWT_SECRET` | Secret key for JWT tokens |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GMAIL_USER` | Gmail address for sending emails |
| `GMAIL_APP_PASSWORD` | Gmail App Password (16 chars) |
| `MFA_ENCRYPTION_KEY` | 32-byte hex key for MFA secret encryption |

### Default Admin / Admin Padrão

| Field | Value |
|---|---|
| Username | `Admin` |
| Password | `1234` (must be changed on first login / deve ser alterada no primeiro login) |

## Usage / Uso

1. Access `http://localhost:3000`
2. Login with admin credentials → change password
3. Create/approve users from admin panel
4. Users can capture receipts via camera or file upload
5. AI automatically transcribes receipt data
6. Filter, sort, and export receipts from the dashboard

---

1. Acesse `http://localhost:3000`
2. Faça login com as credenciais de admin → altere a senha
3. Crie/aprove usuários pelo painel admin
4. Usuários podem capturar notas pela câmera ou upload de arquivo
5. A IA transcreve automaticamente os dados da nota
6. Filtre, ordene e exporte notas pelo dashboard

## Project Structure / Estrutura do Projeto

```
notavault/
├── Dockerfile
├── docker-compose.yml
├── server.js                     # Entry point
├── src/
│   ├── config/                   # Database, email, Gemini config
│   ├── middleware/               # Auth, security, upload, validators
│   ├── routes/                   # API routes (auth, admin, receipts, user)
│   ├── services/                 # Business logic (image, OCR, MFA, email, scheduler)
│   └── utils/                    # Password validation, sanitization
├── public/
│   ├── css/styles.css            # Complete design system
│   ├── *.html                    # Pages (login, register, dashboard, admin, MFA)
│   └── js/                       # Frontend logic
├── data/                         # SQLite database (gitignored)
└── uploads/                      # Compressed images (gitignored)
```

## Security / Segurança

- Parameterized SQL queries (no string interpolation)
- bcrypt password hashing (12 salt rounds)
- JWT with expiration + MFA verification claim
- Helmet security headers + CSP
- Rate limiting (5 login attempts / 15 min)
- Image MIME type validation
- Soft delete (no physical data removal)
- Audit logging with IP tracking
- AES-256-GCM encryption for MFA secrets

## License

Private / Privado
