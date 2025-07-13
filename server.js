// server.js - NextCar AI Advisor Backend
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// System prompt for ChatGPT
const SYSTEM_PROMPT = `You are an expert automotive advisor with 64 years of combined industry experience. You help people find the perfect car based on their specific needs, budget, and lifestyle.

Your conversation style should be:
- Friendly and professional
- Ask targeted questions to understand their needs
- Provide expert insights about different vehicles
- Focus on practical considerations (budget, usage, features, reliability)

Key areas to explore:
1. Budget range (total budget or monthly payment preference)
2. Primary use (daily commuting, family trips, weekend adventures, etc.)
3. Size requirements (number of passengers, cargo needs)
4. Fuel preference (gas, hybrid, electric, diesel)
5. Important features (safety, technology, comfort, performance)
6. Brand preferences or concerns
7. New vs used preference
8. Timeline for purchase

After gathering enough information (usually 3-4 exchanges), you should indicate you're ready to provide recommendations by saying something like: "Perfect! I have enough information to find your ideal matches. Let me search our current inventory and market data to find the 3 best vehicles for your specific needs."

Do not provide specific car recommendations in the chat - save that for the final results page. Focus on understanding their needs through conversation.`;

// Car database
const getCarRecommendations = (userPreferences) => {
    return [
        {
            make: "Toyota",
            model: "Camry Hybrid",
            year: 2024,
            trim: "LE",
            msrp: 28855,
            marketPrice: "$28,855 - $31,200",
            mpg: "51 city / 53 highway",
            safetyRating: "5-star NHTSA rating",
            reliabilityScore: "Excellent (Toyota reliability)",
            features: ["Toyota Safety Sense 2.0", "8-inch touchscreen", "Hybrid powertrain", "LED headlights"],
            dealers: [
                {
                    name: "Toyota of Des Moines",
                    rating: 4.3,
                    phone: "(515) 555-0123",
                    address: "123 Auto Mall Dr, Des Moines, IA 50312",
                    inventory: true
                }
            ],
            pros: ["Excellent fuel economy", "Toyota reliability", "Strong resale value", "Spacious interior"],
            cons: ["CVT transmission feel", "Road noise on highway", "Rear seat could be more comfortable"],
            whyRecommended: "Perfect blend of reliability, fuel efficiency, and value. Ideal for daily commuting with excellent resale value."
        },
        {
            make: "Honda",
            model: "Accord",
            year: 2024,
            trim: "Sport",
            msrp: 27295,
            marketPrice: "$27,295 - $30,500",
            mpg: "32 city / 42 highway",
            safetyRating: "5-star NHTSA rating",
            reliabilityScore: "Excellent (Honda reputation)",
            features: ["Honda Sensing", "Wireless CarPlay", "Sport suspension", "Turbocharged engine", "Premium audio"],
            dealers: [
                {
                    name: "Carousel Honda",
                    rating: 4.5,
                    phone: "(515) 555-0456",
                    address: "456 Honda Way, West Des Moines, IA 50266",
                    inventory: true
                }
            ],
            pros: ["Sporty handling", "Spacious interior", "Strong acceleration", "Excellent build quality"],
            cons: ["Premium fuel recommended", "Firm suspension", "Infotainment can be slow"],
            whyRecommended: "Sporty yet practical with outstanding build quality. Great for those who want driving enjoyment with reliability."
        },
        {
            make: "Mazda",
            model: "6",
            year: 2024,
            trim: "Touring",
            msrp: 26700,
            marketPrice: "$26,700 - $29,900",
            mpg: "26 city / 35 highway",
            safetyRating: "Top Safety Pick+ IIHS",
            reliabilityScore: "Above Average",
            features: ["Premium interior", "Bose audio", "i-ACTIVSENSE safety", "Leather seats", "Heated seats"],
            dealers: [
                {
                    name: "Carousel Mazda",
                    rating: 4.2,
                    phone: "(515) 555-0789",
                    address: "789 Mazda Blvd, Ankeny, IA 50023",
                    inventory: true
                }
            ],
            pros: ["Premium interior quality", "Excellent driving dynamics", "Beautiful design", "Quiet cabin"],
            cons: ["Smaller rear seat", "Less cargo space", "Infotainment learning curve"],
            whyRecommended: "Most premium feel in this price range with exceptional interior quality and driving dynamics."
        }
    ];
};

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve chat page
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Create payment session
app.post('/api/create-payment', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'AI Car Advisor Consultation',
                        description: 'Personalized car recommendations from our AI expert with 64 years of automotive experience'
                    },
                    unit_amount: 2900, // $29.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/chat?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}`,
            metadata: {
                service: 'ai_car_advisor'
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating payment session:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Verify payment
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
            const chatToken = generateChatToken();
            
            res.json({ 
                success: true, 
                chatToken,
                customerEmail: session.customer_details?.email
            });
        } else {
            res.status(400).json({ error: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Chat with AI
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, chatToken } = req.body;
        
        if (!chatToken) {
            return res.status(401).json({ error: 'Valid chat token required' });
        }

        const openaiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: openaiMessages,
            max_tokens: 500,
            temperature: 0.7
        });

        const aiResponse = completion.choices[0].message.content;
        
        const isReadyForRecommendations = aiResponse.toLowerCase().includes('ready to provide recommendations') ||
                                        aiResponse.toLowerCase().includes('find your ideal matches') ||
                                        aiResponse.toLowerCase().includes('search our current inventory') ||
                                        messages.length >= 6;

        res.json({ 
            message: aiResponse,
            readyForRecommendations: isReadyForRecommendations
        });

    } catch (error) {
        console.error('Error in chat:', error);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Get recommendations
app.post('/api/recommendations', async (req, res) => {
    try {
        const { messages, chatToken } = req.body;
        
        if (!chatToken) {
            return res.status(401).json({ error: 'Valid chat token required' });
        }

        const conversationSummary = messages
            .filter(msg => msg.role === 'user')
            .map(msg => msg.content)
            .join(' ');

        const carData = getCarRecommendations(conversationSummary);
        
        const analysisPrompt = `Based on this conversation about car preferences: "${conversationSummary}"

Available cars: ${JSON.stringify(carData, null, 2)}

Select the 3 best matches and explain why each car fits their needs. For each recommendation, provide:
1. Why this specific car matches their requirements
2. How it fits their stated budget and usage
3. Any potential concerns they should know about

Format as JSON with this structure:
{
  "recommendations": [
    {
      "carIndex": 0,
      "matchScore": 95,
      "whyPerfectMatch": "Detailed explanation of why this car fits their needs",
      "budgetFit": "How it fits their budget",
      "potentialConcerns": "Any drawbacks they should consider"
    }
  ]
}`;

        const analysisCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: analysisPrompt }],
            max_tokens: 1000,
            temperature: 0.3
        });

        let analysis;
        try {
            analysis = JSON.parse(analysisCompletion.choices[0].message.content);
        } catch (parseError) {
            analysis = {
                recommendations: [
                    { carIndex: 0, matchScore: 90, whyPerfectMatch: "Great all-around choice for reliability and fuel economy", budgetFit: "Fits most budgets well", potentialConcerns: "CVT transmission may feel different" },
                    { carIndex: 1, matchScore: 85, whyPerfectMatch: "Sporty and reliable with excellent build quality", budgetFit: "Good value for features", potentialConcerns: "Premium fuel recommended for best performance" },
                    { carIndex: 2, matchScore: 80, whyPerfectMatch: "Premium features and excellent driving experience", budgetFit: "Competitive pricing for luxury features", potentialConcerns: "Smaller rear seat may not suit larger families" }
                ]
            };
        }

        const finalRecommendations = analysis.recommendations.map(rec => ({
            ...carData[rec.carIndex],
            matchScore: rec.matchScore,
            whyPerfectMatch: rec.whyPerfectMatch,
            budgetFit: rec.budgetFit,
            potentialConcerns: rec.potentialConcerns
        }));

        res.json({ recommendations: finalRecommendations });

    } catch (error) {
        console.error('Error generating recommendations:', error);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

// Create upsell payment
app.post('/api/create-upsell-payment', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Premium Car Concierge Service',
                        description: 'Complete car buying service: sourcing, negotiation, and delivery. Skip the dealership entirely.'
                    },
                    unit_amount: 54900, // $549.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/concierge-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/chat`,
            metadata: {
                service: 'premium_concierge'
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating upsell payment:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Utility functions
function generateChatToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Webhook for Stripe
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment completed:', session.id, session.metadata.service);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.get('/concierge-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'concierge-success.html'));
});

// Handle concierge form submission
app.post('/api/submit-concierge', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            budget,
            timeline,
            preferredContact,
            currentVehicle,
            mustHaves,
            additionalInfo
        } = req.body;

        // Here you would typically:
        // 1. Save to database
        // 2. Send email notification to your team
        // 3. Send confirmation email to customer
        // 4. Add to CRM system

        console.log('New concierge lead:', {
            name: `${firstName} ${lastName}`,
            email,
            phone,
            budget,
            timeline
        });

        // For now, just log the submission
        // In production, you'd integrate with:
        // - Email service (SendGrid, Mailgun, etc.)
        // - CRM (HubSpot, Salesforce, etc.)
        // - Database (PostgreSQL, MongoDB, etc.)

        res.json({ 
            success: true, 
            message: 'Information received successfully' 
        });

    } catch (error) {
        console.error('Error submitting concierge form:', error);
        res.status(500).json({ 
            error: 'Failed to submit information' 
        });
    }
});

// Update the upsell payment to redirect to concierge form
app.post('/api/create-upsell-payment', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Premium Car Concierge Service',
                        description: 'Complete car buying service: sourcing, negotiation, and delivery. Skip the dealership entirely.'
                    },
                    unit_amount: 54900, // $549.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/concierge-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/chat`,
            metadata: {
                service: 'premium_concierge'
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating upsell payment:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 NextCar AI Advisor server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log('🔑 Environment variables needed:');
    console.log('   - OPENAI_API_KEY');
    console.log('   - STRIPE_SECRET_KEY');
    console.log('   - STRIPE_WEBHOOK_SECRET (after webhook setup)');
});
