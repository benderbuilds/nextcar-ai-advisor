# NextCar AI Advisor

## 🚀 Quick Start

1. **Download all files** to a folder called `nextcar-ai-advisor`
2. **Get your Stripe publishable key** from https://dashboard.stripe.com/test/apikeys
3. **Update index.html** - replace the Stripe key with your actual publishable key
4. **Deploy to Railway** following the steps below

## 📁 File Structure
```
nextcar-ai-advisor/
├── server.js              # Backend API
├── package.json           # Dependencies  
├── .env                   # Your API keys
├── railway.json           # Railway config
├── .gitignore            # Git ignore rules
├── README.md             # This file
└── public/
    ├── index.html        # Landing page
    └── chat.html         # AI chat interface
```

## 🔑 Required API Keys

1. **OpenAI API Key**: Already provided in .env
2. **Stripe Secret Key**: Already provided in .env  
3. **Stripe Publishable Key**: Get from Stripe dashboard and update index.html
4. **Stripe Webhook Secret**: Get after setting up webhook

## 🚀 Railway Deployment

### Method 1: GitHub (Recommended)
1. Create GitHub account
2. Create new repository called `nextcar-ai-advisor`
3. Upload all files to GitHub
4. Go to railway.app → Connect GitHub → Deploy from repo
5. Add environment variables in Railway dashboard

### Method 2: Direct Upload
1. Go to railway.app → New Project → Empty Project
2. Upload all files as ZIP
3. Add environment variables

## ⚙️ Environment Variables for Railway
Add these in Railway dashboard → Variables:

```
OPENAI_API_KEY = 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

STRIPE_SECRET_KEY = sk_test_51RjN6RCSrwRSSwuqrcimJXZOwVvCxp45XUISpSRc26hnzg9RpN2WncZVj3ntpsUrLyUOF94OdMRyjAwTqMFrvzbG0045mUlr9Q

PORT = 3000
NODE_ENV = production
DOMAIN = https://nextcarconierge.com
```

## 🔗 Stripe Webhook Setup
1. Go to https://dashboard.stripe.com/test/webhooks
2. Add endpoint: `https://your-railway-app.up.railway.app/webhook`
3. Select event: `checkout.session.completed`
4. Copy webhook secret and add to Railway environment variables

## 🌐 Custom Domain Setup
1. Railway dashboard → Settings → Custom Domain
2. Add `nextcarconierge.com`
3. Update GoDaddy DNS with provided CNAME

## 🧪 Testing
- Test card: 4242 4242 4242 4242
- Any future expiry date
- Any 3-digit CVC

## 💰 Revenue Flow
- $29 AI Consultation → $549 Premium Concierge
- Monitor in Stripe dashboard

## 🆘 Support
Check Railway logs if issues occur: Railway dashboard → Logs tab

## 📋 Deployment Checklist

- [ ] All files downloaded and organized
- [ ] Stripe publishable key updated in index.html
- [ ] GitHub repository created (if using GitHub method)
- [ ] Railway project created
- [ ] Environment variables added to Railway
- [ ] App deployed and accessible
- [ ] Stripe webhook configured
- [ ] Payment flow tested
- [ ] Custom domain connected

## 🎯 Going Live

When ready to accept real payments:
1. Switch to live Stripe keys in environment variables
2. Update webhook URL to use live endpoint
3. Test with real (small) payment
4. Start driving traffic to your AI advisor!
