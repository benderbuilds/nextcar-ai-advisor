// server.js - NextCar AI Advisor Backend with Enhanced Discovery System
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Email transporter setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// ROUTE HANDLERS - Add these to fix 404 errors
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/service-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'service-success.html'));
});

// Enhanced AI Discovery System
const DISCOVERY_SYSTEM_PROMPT = `You are an expert car buying assistant that helps users discover the perfect vehicle.

Your job is to interpret user input and recommend 3 vehicles that match their needs. You must determine what type of comparison to make:

1. SAME_EXACT_VEHICLE: User wants specific make/model/year - show different dealers/mileage options
2. TRIM_COMPARISON: User wants to compare trims within same make/model 
3. MODEL_COMPARISON: User wants to compare different makes/models
4. EV_COMPARISON: User specifically mentions electric vehicles

Always respond with exactly 3 vehicle recommendations. Be personable and mirror the user's communication style - if they're detailed, be detailed. If brief, be concise.

For explanations, keep them under 30 words when helpful. Focus on being analytical yet friendly.

When you have vehicle recommendations, you MUST call the recommend_vehicles_enhanced function. Do NOT describe or explain the function call - just make the call and provide a brief, friendly message about finding options for them.

NEVER show function call syntax, code, or technical details to the user.`;

// AI Chat endpoint with enhanced discovery
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversation } = req.body;

        const messages = [
            { role: 'system', content: DISCOVERY_SYSTEM_PROMPT },
            ...conversation,
            { role: 'user', content: message }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages,
            functions: [{
                name: 'recommend_vehicles_enhanced',
                description: 'Recommends 3 vehicles with dynamic comparison data based on user needs',
                parameters: {
                    type: 'object',
                    properties: {
                        comparison_type: {
                            type: 'string',
                            enum: ['same_exact_vehicle', 'trim_comparison', 'model_comparison', 'ev_comparison']
                        },
                        vehicles: {
                            type: 'array',
                            maxItems: 3,
                            items: {
                                type: 'object',
                                properties: {
                                    make: { type: 'string' },
                                    model: { type: 'string' },
                                    year: { type: 'string' },
                                    trim: { type: 'string' },
                                    price: { type: 'number' },
                                    mileage: { type: 'number' },
                                    location: { type: 'string' },
                                    dealership: { type: 'string' },
                                    dealership_rating: { type: 'number' },
                                    carfax_available: { type: 'boolean' },
                                    image_url: { type: 'string' },
                                    listing_url: { type: 'string' },
                                    estimated_5yr_cost: { type: 'number' },
                                    reliability_rating: { type: 'number' },
                                    safety_rating: { type: 'number' },
                                    // EV specific
                                    range_epa: { type: 'number' },
                                    range_real_world: { type: 'number' },
                                    battery_capacity: { type: 'number' },
                                    charge_speed_max: { type: 'string' },
                                    charge_port: { type: 'string' }
                                }
                            }
                        },
                        explanation: { type: 'string' },
                        highlighted_differences: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    required: ['comparison_type', 'vehicles']
                }
            }],
            function_call: 'auto'
        });

        const response = completion.choices[0].message;

        // If AI used function call, process the vehicle recommendations
        if (response.function_call) {
            const functionResult = JSON.parse(response.function_call.arguments);
            
            // Enhance with real car search (placeholder for now)
            const enhancedVehicles = await enhanceVehicleData(functionResult.vehicles);
            
            res.json({
                message: `I found ${enhancedVehicles.length} great options for you! Here are your recommendations:`,
                function_call: {
                    name: 'recommend_vehicles_enhanced',
                    arguments: JSON.stringify({
                        ...functionResult,
                        vehicles: enhancedVehicles
                    })
                }
            });
        } else {
            res.json({ message: response.content });
        }
    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// Enhanced vehicle data function
async function enhanceVehicleData(vehicles) {
    // In production, this would search real inventory APIs (AutoTrader, Cars.com, etc.)
    // For now, return mock enhanced data
    return vehicles.map((vehicle, index) => ({
        ...vehicle,
        image_url: vehicle.image_url || `https://via.placeholder.com/300x200?text=${vehicle.make}+${vehicle.model}`,
        listing_url: vehicle.listing_url || `https://cars.com/vehicledetail/detail/${Math.random().toString(36).substr(2, 9)}`,
        carfax_available: vehicle.carfax_available ?? (Math.random() > 0.3),
        dealership_rating: vehicle.dealership_rating || (4.0 + Math.random() * 1.0),
        reliability_rating: vehicle.reliability_rating || (3.5 + Math.random() * 1.5),
        safety_rating: vehicle.safety_rating || (4.0 + Math.random() * 1.0),
        estimated_5yr_cost: vehicle.estimated_5yr_cost || (vehicle.price + 8000 + Math.random() * 5000)
    }));
}

// Service selection and payment endpoints
app.post('/api/create-negotiation-payment', async (req, res) => {
    try {
        const { vehicle, customer } = req.body;
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Car Negotiation Service',
                        description: `Professional negotiation for ${vehicle.year} ${vehicle.make} ${vehicle.model}`
                    },
                    unit_amount: 34900 // $349.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/service-success?session_id={CHECKOUT_SESSION_ID}&service=negotiation`,
            cancel_url: `${req.headers.origin}/chat`,
            metadata: {
                service_type: 'negotiation',
                vehicle_info: JSON.stringify(vehicle),
                customer_info: JSON.stringify(customer)
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

app.post('/api/create-concierge-payment', async (req, res) => {
    try {
        const { vehicle, customer } = req.body;
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Full Concierge Service',
                        description: `Complete car buying service for ${vehicle.year} ${vehicle.make} ${vehicle.model}`
                    },
                    unit_amount: 54900 // $549.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/service-success?session_id={CHECKOUT_SESSION_ID}&service=concierge`,
            cancel_url: `${req.headers.origin}/chat`,
            metadata: {
                service_type: 'concierge',
                vehicle_info: JSON.stringify(vehicle),
                customer_info: JSON.stringify(customer)
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Payment success webhook
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        await handleSuccessfulPayment(session);
    }

    res.json({ received: true });
});

// Handle successful payment
async function handleSuccessfulPayment(session) {
    try {
        const serviceType = session.metadata.service_type;
        const vehicleInfo = JSON.parse(session.metadata.vehicle_info);
        const customerInfo = JSON.parse(session.metadata.customer_info);

        // Send email to customer
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: customerInfo.email,
            subject: `NextCar AI - Your ${serviceType === 'negotiation' ? 'Negotiation' : 'Concierge'} Service Confirmed`,
            html: `
                <h2>Service Confirmed!</h2>
                <p>Thank you for choosing NextCar AI. We'll begin working on your ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model} immediately.</p>
                <p><strong>Service:</strong> ${serviceType === 'negotiation' ? 'Negotiation Service ($349)' : 'Full Concierge Service ($549)'}</p>
                <p>We'll contact you within 24 hours with an update.</p>
                <p>Best regards,<br>NextCar AI Team</p>
            `
        });

        // Send email to team
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: 'support@nextcarai.com',
            subject: `New ${serviceType} Service Purchase`,
            html: `
                <h2>New Service Purchase</h2>
                <p><strong>Service:</strong> ${serviceType}</p>
                <p><strong>Amount:</strong> $${session.amount_total / 100}</p>
                <p><strong>Customer:</strong> ${customerInfo.name} (${customerInfo.email})</p>
                <p><strong>Vehicle:</strong> ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}</p>
                <p><strong>Price:</strong> $${vehicleInfo.price?.toLocaleString()}</p>
                <p><strong>Location:</strong> ${vehicleInfo.location}</p>
                <p><strong>Dealership:</strong> ${vehicleInfo.dealership}</p>
            `
        });

        console.log(`${serviceType} service purchased for ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`);
    } catch (error) {
        console.error('Error handling successful payment:', error);
    }
}

// Contact form endpoint
app.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        // Send email notification
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: 'support@nextcarai.com',
            subject: `New Contact Form Submission: ${subject}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `
        });

        // Send confirmation to user
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Thanks for contacting NextCar AI',
            html: `
                <h2>Thanks for reaching out!</h2>
                <p>Hi ${name},</p>
                <p>We received your message and will get back to you within 2-4 hours during business hours.</p>
                <p>Best regards,<br>NextCar AI Team</p>
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
    console.log(`NextCar AI server running on port ${port}`);
});
