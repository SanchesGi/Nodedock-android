# NodeDock Android

Gerenciador portátil de projetos Node.js para Android.  
O APK é gerado automaticamente pelo GitHub Actions — **sem precisar de Android Studio ou Termux**.

---

## 🚀 Como gerar o APK

1. **Crie um repositório no GitHub** (público ou privado)

2. **Coloque estes arquivos no repositório**
   ```
   .github/workflows/build-apk.yml
   src/
   nodejs-assets/
   scripts/
   index.js
   ```

3. **Dê um push para a branch `main`**
   ```bash
   git init
   git add .
   git commit -m "chore: initial NodeDock Android"
   git remote add origin https://github.com/SEU_USUARIO/nodedock-android.git
   git push -u origin main
   ```

4. **Aguarde o build** (≈ 15–25 minutos na primeira vez)
   - Vá em **Actions** no seu repositório
   - Acompanhe o progresso do workflow `Build NodeDock APK`

5. **Baixe o APK**
   - Após o build, vá em **Releases** e baixe o `.apk`
   - Ou vá em **Actions → workflow run → Artifacts**

---

## 📱 Como usar no Android

1. Instale o APK (habilite "Fontes desconhecidas" se pedido)

2. Abra o NodeDock e toque em **Selecionar** para escolher a pasta dos projetos

3. O app detecta automaticamente qualquer projeto Node.js na pasta selecionada  
   (pasta com `package.json` + `server.js` / `index.js` / `app.js`)

4. Toque **▶ Iniciar** para rodar o projeto

> ⚠️ Cada projeto precisa ter `node_modules` instalado previamente  
> (rode `npm install` no PC antes de copiar para o Android)

---

## 🤖 Telegram Bot

Configure em **⚙ Config** dentro do app:

1. Crie um bot com o [@BotFather](https://t.me/BotFather)
2. Cole o token e o seu Chat ID
3. Salve e teste a conexão

### Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `/status` | Status de todos os projetos |
| `/list` | Lista os projetos |
| `/start <nome>` | Inicia um projeto |
| `/stop <nome>` | Para um projeto |
| `/tunnel <nome>` | Abre/fecha túnel público |
| `/help` | Exibe ajuda |

---

## 🌐 Túneis remotos

Cada projeto pode ter um túnel público aberto via **localtunnel**.  
A URL gerada é enviada automaticamente para o Telegram.

---

## 🗂 Estrutura do repositório

```
nodedock-android/
├── .github/
│   └── workflows/
│       └── build-apk.yml      ← CI/CD completo
├── src/
│   ├── App.jsx                ← Navegação principal
│   ├── screens/
│   │   ├── HomeScreen.jsx     ← Cards de projetos + logs
│   │   └── SettingsScreen.jsx ← Config do Telegram
│   └── lib/
│       └── bridge.js          ← Comunicação RN ↔ Node.js
├── nodejs-assets/
│   └── nodejs-project/
│       ├── main.js            ← Gerenciador de processos
│       ├── telegram.js        ← Bot Telegram (long-polling)
│       ├── tunnels.js         ← Gerenciador de túneis
│       └── package.json
├── scripts/
│   ├── merge-deps.js          ← Mescla dependências no CI
│   ├── patch-gradle.js        ← Configura nodejs-mobile no gradle
│   └── patch-signing.js      ← Configura assinatura do APK
└── index.js                   ← Entry point React Native
```
