require("dotenv").config()
const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const Groq = require("groq-sdk")
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})
const app = express()

// Allow React frontend to talk to this server
app.use(cors())

// Allow the server to understand JSON
app.use(express.json())
mongoose.connect("mongodb+srv://noeljcherian07:Noel123@plot-twist-1.rgi47ew.mongodb.net/")
  .then(() => console.log("Connected to MongoDB ✅"))
  .catch((err) => console.log("Connection failed ❌", err))

  const suggestionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  minutes: Number,
  energy: String,
  suggestion: String,
  createdAt: { type: Date, default: Date.now }
})

const Suggestion = mongoose.model("Suggestion", suggestionSchema)
// Your first route — a GET request at /suggest
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
    interests: [String],
  createdAt: { type: Date, default: Date.now }
})

const User = mongoose.model("User", userSchema)
app.get("/suggest", async (req, res) => {
  const { minutes, energy, userId } = req.query

  try {
    // FIRST — fetch user to get their interests
    const user = await User.findById(userId)
    const interestsText = user.interests && user.interests.length > 0 
      ? `User's interests: ${user.interests.join(", ")}.` 
      : ""

    // THEN — create prompt with interests included
    const message = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `${interestsText}
User has ${minutes} minutes of free time and ${energy} energy level. 
Suggest ONE specific activity they should do right now. 
Be creative, specific, and encouraging. 
Keep it to ONE sentence only. 
No explanations, just the suggestion.`
        }
      ],
      model: "llama-3.3-70b-versatile",
      max_tokens: 100
    })

    const suggestion = message.choices[0].message.content

    // Save to database
    await Suggestion.create({ 
      userId: new mongoose.Types.ObjectId(userId), 
      minutes, 
      energy, 
      suggestion 
    })

    res.json({ suggestion })
  } catch (error) {
    console.log("Groq API error:", error.message)
    res.json({ suggestion: "Something went wrong with AI — try again!" })
  }
})
app.get("/get-interests", async (req, res) => {
  const { userId } = req.query

  try {
    const user = await User.findById(userId)
    res.json({ interests: user.interests || [] })
  } catch (error) {
    console.log("Get interests error:", error.message)
    res.json({ interests: [] })
  }
})

app.post("/chat", async (req, res) => {
  const { userId, suggestion, userMessage } = req.body

  try {
    const message = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `The user got this suggestion: "${suggestion}"
          
They just asked: "${userMessage}"

Answer their question about the suggestion. Be helpful and specific.`
        }
      ],
      model: "llama-3.3-70b-versatile",
      max_tokens: 150
    })

    const aiResponse = message.choices[0].message.content

    res.json({ response: aiResponse })
  } catch (error) {
    console.log("Chat error:", error.message)
    res.json({ response: "Sorry, I couldn't respond right now." })
  }
})


app.post("/signup", async (req, res) => {
  const { email, password } = req.body

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.json({ error: "Email already registered" })
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user
    const user = await User.create({
      email,
      password: hashedPassword
    })

    // Create token so they stay logged in
    const token = jwt.sign({ userId: user._id }, "your-secret-key", { expiresIn: "7d" })

    res.json({ token, userId: user._id, email: user.email })
  } catch (error) {
    res.json({ error: error.message })
  }
})
app.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    // Find user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.json({ error: "User not found" })
    }

    // Check if password matches
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return res.json({ error: "Wrong password" })
    }

    // Create token
    const token = jwt.sign({ userId: user._id }, "your-secret-key", { expiresIn: "7d" })

    res.json({ token, userId: user._id, email: user.email })
  } catch (error) {
    res.json({ error: error.message })
  }
})
app.post("/update-interests", async (req, res) => {
  const { userId, interests } = req.body
    console.log("Received userId:", userId)
  console.log("Received interests:", interests)


  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { interests },
      { returnDocument: 'after' }
    )
    console.log("Updated user interests:", user.interests)

    res.json({ success: true, interests: user.interests })
  } catch (error) {
    console.log("Update interests error:", error.message)
    res.json({ success: false, error: error.message })
  }
})

app.get("/history", async (req, res) => {
  const { userId } = req.query
  
  try {
    const history = await Suggestion.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(5)
    res.json(history)
  } catch (error) {
    console.log("History error:", error.message)
    res.json([])
  }
})
// Start the server on port 3001
app.listen(3001, () => {
  console.log("Plot Twist backend running on http://localhost:3001")
})