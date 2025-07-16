// server.js - NextCar AI Advisor Backend with Enhanced Discovery System
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced Discovery System Prompt
const DISCOVERY_SYSTEM_PROMPT = `You are an expert car buying assistant that helps users discover the perfect vehicle.

Your job is to interpret the user's input—whether it's a specific car (e.g. '2023 Toyota Land Cruiser') or a vague request (e.g. 'something great for snow and under $35k')—and guide them toward exactly 3 vehicles they will love.

PERSONALITY: Be personable and friendly but analytical and professional. Mirror the user's communication style—if they ask detailed questions, respond in detail. If they keep it brief, provide facts quickly.

DISCOVERY LOGIC:
- If user provides Make and Model (with optional Year/Trim), assume they know what they want. Use that to find 3 comparable listings or trim alternatives.
- If user does NOT specify a vehicle, ask 1-2 smart, natural questions to gather:
  • Budget range
  • Use case (commuting, family, road trips, etc.)
  • Fuel preference (gas, hybrid, electric)
  • Size needs (passengers, cargo, car seats)
  • Must-have features (AWD, heated seats, safety tech)

COMPARISON STRATEGY:
Your goal is to present exactly 3 vehicles that match one of these comparison types:
1. SAME VEHICLE (price shopping) - Same make/model/trim, different prices/dealers
2. TRIM COMPARISON - Same make/model, different trim levels
3. MODEL COMPARISON - Different makes/models that meet their needs
4. EV COMPARISON - Electric vehicles with charging/range data

EXPLANATION RULE: Provide a brief explanation (max 30 words) for your recommendations when applicable.

When ready to show vehicles, use the recommend_vehicles_enhanced function. Once you've presented the comparison, users can click "Buy Now" on any vehicle to proceed with negotiation services.

Never show more than 3 vehicles. Keep conversations focused and efficient.`;

// Enhanced Vehicle Recommendation Function Definition
const VEHICLE_RECOMMENDATION_FUNCTION = {
  "name": "recommend_vehicles_enhanced",
  "description": "Analyzes user input and returns exactly 3 vehicles with contextually appropriate comparison data",
  "parameters": {
    "type": "object",
    "properties": {
      "comparison_type": {
        "type": "string",
        "enum": ["same_vehicle", "trim_comparison", "model_comparison", "ev_comparison"],
        "description": "Type of comparison based on user needs"
      },
      "explanation": {
        "type": "string",
        "description": "Brief explanation (max 30 words) for why these vehicles were chosen"
      },
      "vehicles": {
        "type": "array",
        "maxItems": 3,
        "minItems": 3,
        "items": {
          "type": "object",
          "properties": {
            "make": {"type": "string"},
            "model": {"type": "string"},
            "year": {"type": "integer"},
            "trim": {"type": "string"},
            "price": {"type": "number"},
            "mileage": {"type": "number"},
            "location": {"type": "string"},
            "dealership": {"type": "string"},
            "dealership_rating": {"type": "number", "minimum": 1, "maximum": 5},
            "carfax_available": {"type": "boolean"},
            "image_url": {"type": "string"},
            "listing_url": {"type": "string"},
            "estimated_5yr_cost": {"type": "number"},
            "key_features": {"type": "array", "items": {"type": "string"}},
            "missing_features": {"type": "array", "items": {"type": "string"}},
            "reliability_rating": {"type": "number", "minimum": 1, "maximum": 5},
            "safety_rating": {"type": "number", "minimum": 1, "maximum": 5},
            "range_epa": {"type": "number"},
            "range_real_world": {"type": "number"},
            "battery_capacity": {"type": "number"},
            "charge_speed_max": {"type": "string"},
            "charge_port": {"type": "string", "enum": ["Tesla", "CCS", "CHAdeMO", "Type 2"]},
            "badge": {"type": "string", "enum": ["Best Value", "Most Reliable", "Staff Pick", "Lowest Miles", "Best Features"]}
          },
          "required": ["make", "model", "year", "price", "location", "dealership"]
        }
      }
    },
    "required": ["comparison_type", "vehicles", "explanation"]
  }
};

// Enhanced search function with real inventory
async function searchCarListings(searchQuery, location = "Des Moines, Iowa", maxPrice = null) {
    try {
        console.log(`🔍 Searching for: ${searchQuery} in ${location}`);
        
        // If SerpAPI is available, use it for better results
        if (process.env.SERPAPI_KEY) {
            const serpApiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery + ' ' + location + ' car for sale')}&api_key=${process.env.SERPAPI_KEY}`;
            const response = await axios.get(serpApiUrl);
            return response.data.organic_results || [];
        }
        
        // Fallback to basic web search
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery + ' ' + location + ' car for sale site:cars.com OR site:autotrader.com')}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 5000
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.result').each((i, element) => {
            if (results.length < 5) {
                const title = $(element).find('.result__title').text();
                const link = $(element).find('.result__url').attr('href');
                const snippet = $(element).find('.result__snippet').text();
                
                if (title && link && (link.includes('cars.com') || link.includes('autotrader.com'))) {
                    results.push({ title, link, snippet });
                }
            }
        });
        
        return results;
        
    } catch (error) {
        console.error('Search error:', error.message);
        return [];
    }
}

// Generate realistic vehicle data based on search results
function generateVehicleRecommendations(userInput, searchResults, comparisonType) {
    // This would normally process real search results
    // For now, generating realistic sample data based on user input
    
    const sampleVehicles = {
        suv: [
            {
                make: "Honda", model: "Pilot", year: 2023, trim: "EX-L",
                price: 34900, mileage: 12000, location: "Des Moines, IA",
                dealership: "Carousel Honda", dealership_rating: 4.2,
                carfax_available: true, estimated_5yr_cost: 48000,
                reliability_rating: 5, safety_rating: 5,
                key_features: ["Leather Seats", "Navigation", "Sunroof"],
                badge: "Most Reliable"
            },
            {
                make: "Toyota", model: "Highlander", year: 2022, trim: "XLE",
                price: 36200, mileage: 8000, location: "West Des Moines, IA",
                dealership: "Beaverdale Toyota", dealership_rating: 4.5,
                carfax_available: true, estimated_5yr_cost: 49000,
                reliability_rating: 5, safety_rating: 5,
                key_features: ["Hybrid Engine", "AWD", "Safety Sense 2.0"],
                badge: "Best Value"
            },
            {
                make: "Mazda", model: "CX-9", year: 2022, trim: "Touring",
                price: 32100, mileage: 15000, location: "Ankeny, IA",
                dealership: "CarMax", dealership_rating: 4.1,
                carfax_available: true, estimated_5yr_cost: 45000,
                reliability_rating: 4, safety_rating: 5,
                key_features: ["Premium Interior", "Turbo Engine", "Apple CarPlay"],
                badge: "Staff Pick"
            }
        ],
        sedan: [
            {
                make: "Honda", model: "Accord", year: 2023, trim: "EX-L",
                price: 28900, mileage: 5000, location: "Des Moines, IA",
                dealership: "Carousel Honda", dealership_rating: 4.2,
                carfax_available: true, estimated_5yr_cost: 38000,
                reliability_rating: 5, safety_rating: 5,
                badge: "Most Reliable"
            },
            {
                make: "Toyota", model: "Camry", year: 2023, trim: "XSE",
                price: 29500, mileage: 8000, location: "West Des Moines, IA",
                dealership: "Beaverdale Toyota", dealership_rating: 4.5,
                carfax_available: true, estimated_5yr_cost: 39000,
                reliability_rating: 5, safety_rating: 5,
                badge: "Best Value"
            },
            {
                make: "Mazda", model: "Mazda6", year: 2022, trim: "Grand Touring",
                price: 26800, mileage: 12000, location: "Ankeny, IA",
                dealership: "CarMax", dealership_rating: 4.1,
                carfax_available: true, estimated_5yr_cost: 36000,
                reliability_rating: 4, safety_rating: 4,
                badge: "Staff Pick"
            }
        ],
        electric: [
            {
                make: "Tesla", model: "Model Y", year: 2023, trim: "Long Range",
                price: 52900, mileage: 8000, location: "Des Moines, IA",
                dealership: "Tesla Des Moines", dealership_rating: 4.0,
                carfax_available: false, estimated_5yr_cost: 51000,
                range_epa: 330, range_real_world: 280, battery_capacity: 75,
                charge_speed_max: "250kW", charge_port: "Tesla",
                badge: "Most Reliable"
            },
            {
                make: "Ford", model: "Mustang Mach-E", year: 2022, trim: "Premium",
                price: 48200, mileage: 12000, location: "West Des Moines, IA",
                dealership: "Granger Ford", dealership_rating: 4.3,
                carfax_available: true, estimated_5yr_cost: 48000,
                range_epa: 270, range_real_world: 230, battery_capacity: 91,
                charge_speed_max: "150kW", charge_port: "CCS",
                badge: "Best Value"
            },
            {
                make: "Volkswagen", model: "ID.4", year: 2022, trim: "Pro S",
                price: 42100, mileage: 6000, location: "Ankeny, IA",
                dealership: "Volkswagen of Des Moines", dealership_rating: 4.2,
                carfax_available: true, estimated_5yr_cost: 42000,
                range_epa: 275, range_real_world: 240, battery_capacity: 82,
                charge_speed_max: "135kW", charge_port: "CCS",
                badge: "Staff Pick"
            }
        ]
    };
    
    // Determine vehicle type from user input
    const input = userInput.toLowerCase();
    let vehicleType = 'sedan'; // default
    
    if (input.includes('suv') || input.includes('pilot') || input.includes('highlander') || input.includes('family')) {
        vehicleType = 'suv';
    } else if (input.includes('electric') || input.includes('ev') || input.includes('tesla') || input.includes('mach-e')) {
        vehicleType = 'electric';
    }
    
    return sampleVehicles[vehicleType] || sampleVehicles.sedan;
}

// Enhanced chat endpoint
app.post('/api/chat-enhanced', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        
        console.log('🤖 Enhanced chat request:', message);
        
        const messages = [
            { role: 'system', content: DISCOVERY_SYSTEM_PROMPT },
            ...conversationHistory,
            { role: 'user', content: message }
        ];
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: messages,
            functions: [VEHICLE_RECOMMENDATION_FUNCTION],
            function_call: 'auto',
            temperature: 0.7,
            max_tokens: 1000
        });
        
        const response = completion.choices[0].message;
        
        // Check if AI wants to show vehicle recommendations
        if (response.function_call && response.function_call.name === 'recommend_vehicles_enhanced') {
            try {
                const functionArgs = JSON.parse(response.function_call.arguments);
                console.log('🚗 Generating vehicle recommendations:', functionArgs);
                
                // Perform search if needed
                const searchQuery = message; // Simplified for now
                const searchResults = await searchCarListings(searchQuery);
                
                // Generate vehicle data (would be based on real search results)
                const vehicles = generateVehicleRecommendations(message, searchResults, functionArgs.comparison_type);
                
                // Take only 3 vehicles as specified
                functionArgs.vehicles = vehicles.slice(0, 3);
                
                res.json({
                    response: response.content || "Here are your personalized recommendations:",
                    function_call: {
                        name: 'recommend_vehicles_enhanced',
                        arguments: functionArgs
                    }
                });
                
            } catch (parseError) {
                console.error('Function parsing error:', parseError);
                res.json({ response: response.content || "I'd be happy to help you find the perfect car. What are you looking for?" });
            }
        } else {
            res.json({ response: response.content });
        }
        
    } catch (error) {
        console.error('Error in enhanced chat:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Service selection and payment endpoints
app.post('/api/create-service-payment', async (req, res) => {
    try {
        const { serviceType, vehicleInfo, amount } = req.body;
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: serviceType === 'negotiation' ? 'Negotiation Service' : 'Full Concierge Service',
                        description: `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`,
                    },
                    unit_amount: amount * 100,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.DOMAIN}/service-success?session_id={CHECKOUT_SESSION_ID}&service=${serviceType}`,
            cancel_url: `${process.env.DOMAIN}/chat`,
            metadata: {
                service_type: serviceType,
                vehicle_make: vehicleInfo.make,
                vehicle_model: vehicleInfo.model,
                vehicle_year: vehicleInfo.year,
                vehicle_price: vehicleInfo.price
            }
        });

        res.json({ sessionId: session.id });
        
    } catch (error) {
        console.error('Error creating service payment session:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Service success page
app.get('/service-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'service-success.html'));
});

// Handle service form submission
app.post('/api/submit-service-details', async (req, res) => {
    try {
        const {
            sessionId, serviceType, firstName, lastName, email, phone, 
            budget, timeline, preferredContact, currentVehicle, 
            mustHaves, additionalInfo, vehicleInfo
        } = req.body;

        // Email to your team
        const teamEmail = {
            to: 'nextcarconcierge@gmail.com',
            from: 'nextcarconcierge@gmail.com',
            subject: `🚗 New ${serviceType === 'negotiation' ? 'Negotiation' : 'Concierge'} Service Customer: ${firstName} ${lastName}`,
            html: `
                <h2>New ${serviceType === 'negotiation' ? 'Negotiation Service' : 'Full Concierge Service'} Customer (${serviceType === 'negotiation' ? '$349' : '$549'} paid)</h2>
                
                <h3>Selected Vehicle:</h3>
                <ul>
                    <li><strong>Vehicle:</strong> ${vehicleInfo?.year || ''} ${vehicleInfo?.make || ''} ${vehicleInfo?.model || ''}</li>
                    <li><strong>Listed Price:</strong> $${vehicleInfo?.price?.toLocaleString() || 'N/A'}</li>
                    <li><strong>Dealership:</strong> ${vehicleInfo?.dealership || 'N/A'}</li>
                    <li><strong>Location:</strong> ${vehicleInfo?.location || 'N/A'}</li>
                </ul>
                
                <h3>Contact Information:</h3>
                <ul>
                    <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Phone:</strong> ${phone}</li>
                    <li><strong>Preferred Contact:</strong> ${preferredContact}</li>
                </ul>
                
                <h3>Requirements:</h3>
                <ul>
                    <li><strong>Budget:</strong> ${budget || 'Not specified'}</li>
                    <li><strong>Timeline:</strong> ${timeline || 'Not specified'}</li>
                    <li><strong>Current Vehicle:</strong> ${currentVehicle || 'None'}</li>
                </ul>
                
                <h3>Must-Have Features:</h3>
                <p>${mustHaves || 'None specified'}</p>
                
                <h3>Additional Information:</h3>
                <p>${additionalInfo || 'None provided'}</p>
                
                <p><strong>Stripe Session:</strong> ${sessionId}</p>
                <p><strong>Action Required:</strong> Contact customer within 24 hours!</p>
            `
        };

        // Customer confirmation email
        const customerEmail = {
            to: email,
            from: 'nextcarconcierge@gmail.com',
            subject: `Welcome to NextCar ${serviceType === 'negotiation' ? 'Negotiation' : 'Concierge'} Service!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Thank you, ${firstName}! 🎉</h2>
                    
                    <p>We've received your information and one of our automotive experts will contact you within 24 hours.</p>
                    
                    <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
                        <h3 style="color: #333; margin: 0 0 10px 0;">Selected Vehicle:</h3>
                        <p style="margin: 0;"><strong>${vehicleInfo?.year || ''} ${vehicleInfo?.make || ''} ${vehicleInfo?.model || ''}</strong></p>
                        <p style="margin: 0;">Listed at $${vehicleInfo?.price?.toLocaleString() || 'N/A'} - ${vehicleInfo?.dealership || 'N/A'}</p>
                    </div>
                    
                    <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
                        <h3 style="color: #333; margin: 0 0 10px 0;">What happens next:</h3>
                        <ol style="margin: 0; padding-left: 20px;">
                            ${serviceType === 'negotiation' ? 
                                '<li>Expert consultation call</li><li>Dealer contact and price negotiation</li><li>Final pricing presentation</li>' :
                                '<li>Expert consultation call</li><li>Dealer contact and price negotiation</li><li>Trade-in coordination (if applicable)</li><li>Paperwork and delivery coordination</li>'
                            }
                        </ol>
                    </div>
                    
                    <p>Questions? Contact us at nextcarconcierge@gmail.com</p>
                    
                    <hr style="margin: 30px 0; border: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">
                        NextCar Concierge<br>
                        This email was sent because you purchased our ${serviceType === 'negotiation' ? 'Negotiation' : 'Concierge'} Service.<br>
                        Contact: nextcarconcierge@gmail.com
                    </p>
                </div>
            `
        };

        // Send emails
        await sgMail.send(teamEmail);
        await sgMail.send(customerEmail);

        res.json({ success: true, message: 'Service details submitted successfully' });

    } catch (error) {
        console.error('Service submission error:', error);
        res.status(500).json({ error: 'Failed to submit service details' });
    }
});

// Legacy endpoints for compatibility
app.post('/api/chat', async (req, res) => {
    // Redirect to enhanced endpoint
    req.url = '/api/chat-enhanced';
    return app.handle(req, res);
});

// Existing endpoints (concierge, health check, etc.)
app.get('/concierge-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'concierge-success.html'));
});

app.post('/api/submit-concierge', async (req, res) => {
    // Existing concierge form handler (keeping for backward compatibility)
    try {
        const {
            firstName, lastName, email, phone, budget, timeline, 
            preferredContact, currentVehicle, mustHaves, additionalInfo
        } = req.body;

        const teamEmail = {
            to: 'nextcarconcierge@gmail.com',
            from: 'nextcarconcierge@gmail.com',
            subject: `🚗 New Premium Concierge Lead: ${firstName} ${lastName}`,
            html: `
                <h2>New Premium Concierge Customer ($549 paid)</h2>
                <h3>Contact Information:</h3>
                <ul>
                    <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Phone:</strong> ${phone}</li>
                    <li><strong>Preferred Contact:</strong> ${preferredContact}</li>
                </ul>
                <h3>Car Requirements:</h3>
                <ul>
                    <li><strong>Budget:</strong> ${budget || 'Not specified'}</li>
                    <li><strong>Timeline:</strong> ${timeline || 'Not specified'}</li>
                    <li><strong>Current Vehicle:</strong> ${currentVehicle || 'None'}</li>
                </ul>
                <h3>Must-Have Features:</h3>
                <p>${mustHaves || 'None specified'}</p>
                <h3>Additional Information:</h3>
                <p>${additionalInfo || 'None provided'}</p>
                <p><strong>Action Required:</strong> Contact customer within 24 hours!</p>
            `
        };

        await sgMail.send(teamEmail);
        res.json({ success: true, message: 'Information received successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to submit information' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 NextCar AI Advisor server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Domain: ${process.env.DOMAIN || 'http://localhost:' + PORT}`);
    console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? 'Connected' : 'Missing API Key'}`);
    console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Missing API Key'}`);
    console.log(`📧 SendGrid: ${process.env.SENDGRID_API_KEY ? 'Connected' : 'Missing API Key'}`);
    console.log(`🔍 SerpAPI: ${process.env.SERPAPI_KEY ? 'Connected' : 'Using basic search'}`);
});
