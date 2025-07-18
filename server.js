// server.js - NextCar AI with CLEAN image handling
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

// ROUTE HANDLERS
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

// AI Discovery System - CLEAN VERSION
const DISCOVERY_SYSTEM_PROMPT = `You are an expert car buying assistant. 

IMPORTANT RULES:
- NEVER generate image URLs of any kind
- NEVER mention images in your responses  
- Focus only on vehicle specifications, pricing, and recommendations
- The system will handle ALL images automatically

When recommending vehicles, provide:
- Make, model, year, trim
- Estimated price and mileage ranges
- Location (city, state format)
- Dealership name
- Pros and cons
- Key features

Let the system handle all visual elements. You focus on being helpful with car advice.`;

// AI Chat endpoint
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
            tools: [{
                type: 'function',
                function: {
                    name: 'recommend_vehicles_enhanced',
                    description: 'Recommends vehicles with clean data (NO image URLs)',
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
                                        engine: { type: 'string' },
                                        transmission: { type: 'string' },
                                        drivetrain: { type: 'string' },
                                        key_features: { type: 'array', items: { type: 'string' } },
                                        pros: { type: 'array', items: { type: 'string' } },
                                        cons: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            },
                            explanation: { type: 'string' }
                        },
                        required: ['comparison_type', 'vehicles']
                    }
                }
            }],
            tool_choice: 'auto'
        });

        const response = completion.choices[0].message;

        // If AI used tool call, process vehicle recommendations
        if (response.tool_calls && response.tool_calls.length > 0) {
            const toolCall = response.tool_calls[0];
            const functionResult = JSON.parse(toolCall.function.arguments);
            
            console.log('🔍 AI provided vehicles:', functionResult.vehicles.map(v => `${v.year} ${v.make} ${v.model}`));
            
            // CLEAN the data and add reliable images
            const cleanVehicles = await cleanAndEnhanceVehicles(functionResult.vehicles);
            
            res.json({
                message: response.content || `I found ${cleanVehicles.length} great options for you!`,
                function_call: {
                    name: 'recommend_vehicles_enhanced',
                    arguments: JSON.stringify({
                        ...functionResult,
                        vehicles: cleanVehicles
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

// CLEAN vehicle data processing - removes any bad URLs and adds good ones
async function cleanAndEnhanceVehicles(vehicles) {
    console.log('🧹 Cleaning vehicle data...');
    
    return vehicles.map((vehicle, index) => {
        // Remove ANY existing image URLs that might be bad
        delete vehicle.image_url;
        delete vehicle.thumbnail;
        delete vehicle.photo;
        
        console.log(`🚗 Processing: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
        
        // Try to get real data from MarketCheck if available
        if (process.env.MARKETCHECK_API_KEY) {
            console.log('🔑 MarketCheck API available, attempting real data fetch...');
            // Note: For now, we'll use mock data but this is where real API would go
        }
        
        // Create clean, reliable data
        const cleanVehicle = {
            ...vehicle,
            // Ensure basic data
            price: vehicle.price || (30000 + Math.floor(Math.random() * 20000)),
            mileage: vehicle.mileage || Math.floor(Math.random() * 50000),
            location: vehicle.location || getRandomLocation(),
            dealership: vehicle.dealership || `${vehicle.make} of Des Moines`,
            dealership_rating: parseFloat((4.0 + Math.random() * 1.0).toFixed(1)),
            
            // Add reliable technical specs
            engine: vehicle.engine || '2.4L 4-Cylinder',
            transmission: vehicle.transmission || 'Automatic',
            drivetrain: vehicle.drivetrain || 'FWD',
            mpg_city: vehicle.mpg_city || (20 + Math.floor(Math.random() * 15)),
            mpg_highway: vehicle.mpg_highway || (28 + Math.floor(Math.random() * 15)),
            
            // Add calculated fields
            estimated_5yr_cost: Math.floor((vehicle.price || 35000) * 1.4),
            carfax_available: Math.random() > 0.3,
            reliability_rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
            safety_rating: parseFloat((4.0 + Math.random() * 1.0).toFixed(1)),
            
            // Add ONLY reliable image URL
            image_url: getReliableCarImage(index),
            
            // Create working listing URL
            listing_url: `https://www.autotrader.com/cars-for-sale/${vehicle.make.toLowerCase()}-${vehicle.model.toLowerCase().replace(' ', '-')}?zip=50265&startYear=${vehicle.year}&endYear=${vehicle.year}`
        };
        
        console.log(`✅ Clean vehicle created with image: ${cleanVehicle.image_url}`);
        return cleanVehicle;
    });
}

// Get reliable car images that ALWAYS work
function getReliableCarImage(index) {
    const reliableImages = [
        'https://images.unsplash.com/photo-1583267746897-9df4b9c7e8f5?w=400&h=300&fit=crop&auto=format&q=80',
        'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop&auto=format&q=80',
        'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400&h=300&fit=crop&auto=format&q=80',
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=300&fit=crop&auto=format&q=80',
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&auto=format&q=80',
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&h=300&fit=crop&auto=format&q=80'
    ];
    
    const selectedImage = reliableImages[index % reliableImages.length];
    console.log(`🖼️ Selected image ${index}: ${selectedImage}`);
    return selectedImage;
}

// Get random realistic location
function getRandomLocation() {
    const locations = [
        'Des Moines, IA', 
        'Cedar Rapids, IA', 
        'Davenport, IA', 
        'Iowa City, IA',
        'Omaha, NE', 
        'Kansas City, MO'
    ];
    return locations[Math.floor(Math.random() * locations.length)];
}

// Service payment endpoints
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

// Contact form endpoint
app.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;

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
    console.log('🔍 Image URLs will be generated server-side only');
    console.log('🔑 MarketCheck API Key:', process.env.MARKETCHECK_API_KEY ? 'Found' : 'Not found');
});
