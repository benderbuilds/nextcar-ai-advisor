// server.js - NextCar AI Advisor Backend with Enhanced Real-Time Search
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize OpenAI and SendGrid
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Enhanced system prompt for web-searching AI
const ENHANCED_SYSTEM_PROMPT = `You are an expert automotive advisor with 64 years of combined industry experience and the ability to search the internet for real, current car listings.

Your conversation style should be:
- Friendly and professional
- Ask targeted questions to understand their needs
- Search for REAL, AVAILABLE cars based on their requirements
- Provide specific vehicles with actual pricing and dealer information

Key areas to explore:
1. Budget range (total budget or monthly payment preference)
2. Location (city/state for local searches) - VERY IMPORTANT for finding local inventory
3. Primary use (daily commuting, family trips, weekend adventures, etc.)
4. Size requirements (number of passengers, cargo needs)
5. Fuel preference (gas, hybrid, electric, diesel)
6. Important features (safety, technology, comfort, performance)
7. Brand preferences or concerns
8. New vs used preference
9. Timeline for purchase

IMPORTANT: After gathering their location and requirements (usually 3-4 exchanges), you should search for real car listings. Always search for specific, available vehicles that match their criteria.

When you have enough information to search, say something like: "Perfect! Let me search for real, available vehicles that match your criteria in [their location]. I'll find specific cars you can actually purchase today."

Do not provide generic recommendations - always search for real listings when you have sufficient information.`;

// Original system prompt for fallback
const ORIGINAL_SYSTEM_PROMPT = `You are an expert automotive advisor with 64 years of combined industry experience. You help people find the perfect car based on their specific needs, budget, and lifestyle.

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

// Static car database (fallback system)
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

// Enhanced web search functions
async function searchCarListings(searchQuery, location, maxPrice) {
    try {
        console.log(`Searching for: ${searchQuery} in ${location} under $${maxPrice}`);
        
        const searches = [
            // AutoTempest search
            `site:autotempest.com ${searchQuery} ${location} under $${maxPrice}`,
            // Cars.com search
            `site:cars.com ${searchQuery} ${location} price under ${maxPrice}`,
            // AutoTrader search
            `site:autotrader.com ${searchQuery} ${location} max price ${maxPrice}`,
            // CarGurus search
            `site:cargurus.com ${searchQuery} ${location} under $${maxPrice}`,
            // CarMax search
            `site:carmax.com ${searchQuery} ${location} under ${maxPrice}`
        ];

        const allResults = [];

        // Enhanced search using SerpAPI if available
        if (process.env.SERPAPI_KEY) {
            try {
                const serpResponse = await axios.get('https://serpapi.com/search', {
                    params: {
                        engine: 'google',
                        q: `${searchQuery} ${location} car for sale under $${maxPrice}`,
                        api_key: process.env.SERPAPI_KEY,
                        num: 15
                    },
                    timeout: 10000
                });

                if (serpResponse.data.organic_results) {
                    serpResponse.data.organic_results.forEach(result => {
                        if (isCarListingSite(result.link)) {
                            allResults.push({
                                title: result.title,
                                url: result.link,
                                snippet: result.snippet,
                                source: extractSiteName(result.link),
                                price: extractPrice(result.snippet || result.title)
                            });
                        }
                    });
                }
            } catch (serpError) {
                console.log('SerpAPI error:', serpError.message);
            }
        }

        // Fallback to basic search if SerpAPI not available or failed
        if (allResults.length === 0) {
            for (const search of searches) {
                try {
                    // Using a simple search approach
                    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(search)}`;
                    
                    const response = await axios.get(searchUrl, {
                        timeout: 8000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });

                    // Basic parsing for car listing sites
                    if (response.data && response.data.includes('cars.com')) {
                        allResults.push({
                            title: `${searchQuery} - Found on ${extractSiteName(search)}`,
                            url: '#',
                            snippet: `Vehicle matching your criteria found. Search: ${searchQuery}`,
                            source: extractSiteName(search),
                            price: maxPrice ? `Under $${maxPrice.toLocaleString()}` : 'See listing'
                        });
                    }
                } catch (searchError) {
                    console.log('Search error for:', search, searchError.message);
                    continue;
                }
            }
        }

        // If still no results, create sample results based on search
        if (allResults.length === 0) {
            allResults.push(
                {
                    title: `${searchQuery} - ${location} Area`,
                    url: `https://cars.com/search/?q=${encodeURIComponent(searchQuery + ' ' + location)}`,
                    snippet: `Multiple ${searchQuery} vehicles available in ${location} area`,
                    source: 'cars.com',
                    price: maxPrice ? `Under $${maxPrice.toLocaleString()}` : 'Multiple price ranges'
                },
                {
                    title: `${searchQuery} Inventory - ${location}`,
                    url: `https://autotrader.com/cars-for-sale/${encodeURIComponent(searchQuery)}/${encodeURIComponent(location)}`,
                    snippet: `Current ${searchQuery} inventory with competitive pricing`,
                    source: 'autotrader.com',
                    price: maxPrice ? `Starting under $${maxPrice.toLocaleString()}` : 'Various prices'
                }
            );
        }

        return allResults.slice(0, 8); // Return top 8 results

    } catch (error) {
        console.error('Error searching car listings:', error);
        return [];
    }
}

// Helper functions
function extractSiteName(url) {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return 'Car Listing Site';
    }
}

function isCarListingSite(url) {
    const carSites = [
        'cars.com',
        'autotrader.com',
        'cargurus.com',
        'autotempest.com',
        'carmax.com',
        'vroom.com',
        'carfax.com',
        'edmunds.com',
        'truecar.com',
        'carsdirect.com'
    ];
    
    return carSites.some(site => url.includes(site));
}

function extractPrice(text) {
    if (!text) return null;
    const priceMatch = text.match(/\$[\d,]+/);
    return priceMatch ? priceMatch[0] : null;
}

function shouldSearchForListings(messages) {
    const conversation = messages.map(m => m.content).join(' ').toLowerCase();
    
    // Look for location and car type indicators
    const hasLocation = /\b(iowa|des moines|cedar rapids|iowa city|ames|waterloo|sioux city|davenport|council bluffs|ia|near me|local)\b/.test(conversation);
    const hasCarType = /\b(suv|sedan|truck|car|vehicle|honda|toyota|ford|chevy|nissan|mazda|subaru|hyundai|kia|bmw|audi|mercedes)\b/.test(conversation);
    const hasBudgetOrIntent = /\$\d+|budget|price|afford|spend|buy|purchase|looking for|need|want/.test(conversation);
    
    return (hasLocation || messages.length >= 4) && hasCarType && hasBudgetOrIntent && messages.length >= 3;
}

function extractSearchCriteria(messages) {
    const conversation = messages.map(m => m.content).join(' ');
    
    // Extract location
    const locationMatch = conversation.match(/\b(iowa|des moines|cedar rapids|iowa city|ames|waterloo|sioux city|davenport|council bluffs)\b/i);
    const location = locationMatch ? locationMatch[0] : 'Iowa';
    
    // Extract budget
    const budgetMatch = conversation.match(/\$(\d+,?\d*)/);
    const maxPrice = budgetMatch ? parseInt(budgetMatch[1].replace(',', '')) : null;
    
    // Extract car preferences
    const carTerms = [];
    const carMatches = conversation.match(/\b(suv|sedan|truck|coupe|wagon|minivan|honda|toyota|ford|chevy|nissan|mazda|subaru|hyundai|kia|bmw|audi|mercedes|reliable|family|luxury|sport|compact|midsize|full.?size)\b/gi);
    if (carMatches) {
        carTerms.push(...new Set(carMatches.map(term => term.toLowerCase())));
    }
    
    // Extract year preferences
    const yearMatch = conversation.match(/\b(20\d{2}|new|used|recent|older)\b/gi);
    if (yearMatch) {
        carTerms.push(...yearMatch);
    }
    
    const query = carTerms.length > 0 ? carTerms.slice(0, 3).join(' ') : 'reliable car';
    
    return {
        query,
        location,
        maxPrice
    };
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve chat page
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Serve concierge success page
app.get('/concierge-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'concierge-success.html'));
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

// Enhanced chat endpoint with web search capability
app.post('/api/chat-enhanced', async (req, res) => {
    try {
        const { messages, chatToken } = req.body;
        
        if (!chatToken) {
            return res.status(401).json({ error: 'Valid chat token required' });
        }

        // Determine if we should search for listings
        const shouldSearch = shouldSearchForListings(messages);
        let searchResults = [];

        if (shouldSearch) {
            // Extract search criteria from conversation
            const searchCriteria = extractSearchCriteria(messages);
            
            if (searchCriteria.query && searchCriteria.location) {
                console.log('Performing car search:', searchCriteria);
                searchResults = await searchCarListings(
                    searchCriteria.query,
                    searchCriteria.location,
                    searchCriteria.maxPrice || 100000
                );
            }
        }

        // Prepare messages for OpenAI
        const openaiMessages = [
            { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
            ...messages
        ];

        // Add search results to the conversation if we have them
        if (searchResults.length > 0) {
            openaiMessages.push({
                role: 'system',
                content: `Current car listings found: ${JSON.stringify(searchResults.slice(0, 5), null, 2)}`
            });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: openaiMessages,
            max_tokens: 800,
            temperature: 0.7
        });

        const aiResponse = completion.choices[0].message.content;
        
        const isReadyForRecommendations = aiResponse.toLowerCase().includes('search for real') ||
                                        aiResponse.toLowerCase().includes('find specific') ||
                                        aiResponse.toLowerCase().includes('available vehicles') ||
                                        searchResults.length > 0 ||
                                        messages.length >= 6;

        res.json({ 
            message: aiResponse,
            readyForRecommendations: isReadyForRecommendations,
            searchResults: searchResults
        });

    } catch (error) {
        console.error('Error in enhanced chat:', error);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Original chat endpoint (fallback)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, chatToken } = req.body;
        
        if (!chatToken) {
            return res.status(401).json({ error: 'Valid chat token required' });
        }

        const openaiMessages = [
            { role: 'system', content: ORIGINAL_SYSTEM_PROMPT },
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

// Enhanced recommendations endpoint
app.post('/api/recommendations-enhanced', async (req, res) => {
    try {
        const { messages, chatToken, searchResults } = req.body;
        
        if (!chatToken) {
            return res.status(401).json({ error: 'Valid chat token required' });
        }

        // If we have search results from chat, use them
        let finalResults = searchResults || [];
        
        // If no search results, perform search based on conversation
        if (finalResults.length === 0) {
            const searchCriteria = extractSearchCriteria(messages);
            if (searchCriteria.query && searchCriteria.location) {
                finalResults = await searchCarListings(
                    searchCriteria.query,
                    searchCriteria.location,
                    searchCriteria.maxPrice
                );
            }
        }

        // If still no results, use static database as fallback
        if (finalResults.length === 0) {
            console.log('No web search results, using static database fallback');
            const staticResults = getCarRecommendations();
            finalResults = staticResults.map(car => ({
                title: `${car.year} ${car.make} ${car.model} ${car.trim}`,
                url: '#',
                source: 'Expert Database',
                snippet: car.whyRecommended,
                price: car.marketPrice,
                staticData: car
            }));
        }

        // Use AI to analyze and format the listings
        const analysisPrompt = `Based on this conversation: "${messages.map(m => m.content).join(' ')}"

And these car listings: ${JSON.stringify(finalResults.slice(0, 5), null, 2)}

Select the 3 best vehicle matches and explain why each one fits their needs. For each recommendation, provide:
1. The exact vehicle details from the listing
2. Why this specific car matches their requirements  
3. The actual price and source information
4. Advantages and considerations

Format as JSON with this structure:
{
  "recommendations": [
    {
      "title": "Exact title from listing",
      "url": "Direct link to listing or # if unavailable",
      "source": "Website name or Expert Database", 
      "whyPerfectMatch": "Detailed explanation",
      "estimatedPrice": "Price range or actual price",
      "pros": ["Advantage 1", "Advantage 2"],
      "cons": ["Consideration 1", "Consideration 2"]
    }
  ]
}`;

        const analysisCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: analysisPrompt }],
            max_tokens: 1500,
            temperature: 0.3
        });

        let analysis;
        try {
            analysis = JSON.parse(analysisCompletion.choices[0].message.content);
        } catch (parseError) {
            // Fallback to original listings if parsing fails
            analysis = {
                recommendations: finalResults.slice(0, 3).map(result => ({
                    title: result.title,
                    url: result.url || '#',
                    source: result.source || 'Car Listing',
                    whyPerfectMatch: result.snippet || "This vehicle matches your search criteria and requirements.",
                    estimatedPrice: result.price || "See listing for current pricing",
                    pros: ["Available in your area", "Matches your criteria"],
                    cons: ["Contact dealer for detailed inspection", "Pricing subject to change"]
                }))
            };
        }

        res.json({ 
            recommendations: analysis.recommendations,
            searchPerformed: finalResults.length > 0,
            totalListingsFound: finalResults.length,
            usedFallback: searchResults?.length === 0 && finalResults.some(r => r.staticData)
        });

    } catch (error) {
        console.error('Error generating enhanced recommendations:', error);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

// Original recommendations endpoint (fallback)
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
        const { interestedCars } = req.body;
        
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
                service: 'premium_concierge',
                interestedCars: interestedCars ? JSON.stringify(interestedCars) : ''
            }
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating upsell payment:', error);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Handle concierge form submission
app.post('/api/submit-concierge', async (req, res) => {
    try {
        const {
            firstName, lastName, email, phone, budget, timeline, 
            preferredContact, currentVehicle, mustHaves, additionalInfo
        } = req.body;

        // Email to your team
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

        // Customer confirmation email
        const customerEmail = {
            to: email,
            from: 'nextcarconcierge@gmail.com',
            subject: 'Welcome to NextCar Premium Concierge Service!',
            html: `
                <h2>Thank you, ${firstName}! 🎉</h2>
                
                <p>We've received your information and one of our automotive experts will contact you within 24 hours.</p>
                
                <h3>What happens next:</h3>
                <ol>
                    <li>Expert consultation call</li>
                    <li>Custom car search strategy</li>
                    <li>Professional negotiation</li>
                    <li>Delivery coordination</li>
                </ol>
                
                <p>Questions? Reply to this email or contact nextcarconcierge@gmail.com</p>
                
                <p>Best regards,<br>The NextCar Concierge Team</p>
            `
        };

        // Send emails
        await sgMail.send(teamEmail);
        await sgMail.send(customerEmail);

        res.json({ success: true, message: 'Information received successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to submit information' });
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 NextCar AI Advisor server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log('🔑 Environment variables needed:');
    console.log('   - OPENAI_API_KEY');
    console.log('   - STRIPE_SECRET_KEY');
    console.log('   - SENDGRID_API_KEY');
    console.log('   - SERPAPI_KEY (optional for enhanced search)');
    console.log('   - STRIPE_WEBHOOK_SECRET (after webhook setup)');
});
