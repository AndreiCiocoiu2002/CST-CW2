const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const propertiesReader = require('properties-reader');
const { MongoClient, ObjectId } = require('mongodb');



const app = express();
app.use(cors());
const port = 3000;

// MongoDB Connection
async function connectToMongoDB() {
  try {
    const propertiesPath = path.resolve(__dirname, 'db.properties');
    const properties = propertiesReader(propertiesPath);
    
    const dbPrefix = properties.get('db.prefix'); // e.g., "mongodb+srv://"
    const dbUser = encodeURIComponent(properties.get('db.user')); // e.g., "and112"
    const dbPwd = encodeURIComponent(properties.get('db.pwd')); // e.g., "2002"
    const dbName = properties.get('db.dbName'); // Your database name
    const dbUrl = properties.get('db.dbUrl'); // e.g., "clustercw2.dutfc5z.mongodb.net"
    const dbParams = properties.get('db.params'); // e.g., "?retryWrites=true&w=majority"

    const uri = `${dbPrefix}${dbUser}:${dbPwd}@${dbUrl}/${dbName}${dbParams}`;
    
    const client = new MongoClient(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tlsInsecure: false // Remove this or set to false in production
    });

    await client.connect();
    console.log('Connected to MongoDB');
    return client.db(dbName); // Return the database connection
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}


// Logger Middleware
app.use(morgan('dev'));

// Static File Middleware for Lesson Images
const lessonImagesPath = path.resolve(__dirname, 'lesson-images');
app.use('/images', express.static(lessonImagesPath));

// MongoDB Connection and Server Start
connectToMongoDB()
  .then((database) => {
    // Middleware for parsing JSON in request body
    app.use(express.json());

    // Example route
    app.get('/', (req, res) => {
      res.send('Hello, MongoDB!');
    });

    // Route to get all lessons
    app.get('/lessons', async (req, res) => {
      try {
        const lessons = await database.collection('Products').find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Route to save a new order
    app.post('/orders', async (req, res) => {
      try {
        const { name, phoneNumber, lessonIDs, numberOfSpace } = req.body;

        // Basic validation
        if (!name || typeof name !== 'string' ||
            !phoneNumber || typeof phoneNumber !== 'string' ||
            !lessonIDs || !Array.isArray(lessonIDs) ||
            !numberOfSpace || typeof numberOfSpace !== 'number') {
          return res.status(400).json({ msg: "error", error: "Invalid order data" });
        }

        app.get('/orders', async (req, res) => {
          try {
            const orders = await database.collection('orders').find({}).toArray();
            res.json(orders);
          } catch (error) {
            console.error('Error fetching orders:', error);
            res.status(500).send('Internal Server Error');
          }
        });

        // Insert the new order into the database
        const result = await database.collection('orders').insertOne({
          name,
          phoneNumber,
          lessonIDs,
          numberOfSpace,
          orderDate: new Date() // You can add an order date if you want to track when orders are placed
        });

        // Respond with success message and the new order's ID
        res.status(201).json({ msg: 'Order successfully placed', orderId: result.insertedId });
      } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).send({ msg: "error", error: "Internal Server Error" });
      }
    });

    app.get('/lessons/:id', async (req, res) => {
      const lessonId = req.params.id;
    
      if (!lessonId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).send({ msg: "Invalid lesson ID format" });
      }
    
      try {
        const lesson = await database.collection('Products').findOne({ _id: new ObjectId(lessonId) });
        
        if (lesson) {
          res.json(lesson);
        } else {
          res.status(404).send({ msg: "Lesson not found" });
        }
      } catch (error) {
        console.error('Error fetching lesson:', error);
        res.status(500).send('Internal Server Error');
      }
    });
    
    // Generic PUT route to update a document in the 'Products' collection
    app.put('/lessons/:id', async (req, res) => {
      const lessonId = req.params.id;
      let { stockToDecrement } = req.body; // This should be passed in the body of your PUT request
  
      if (!ObjectId.isValid(lessonId)) {
          return res.status(400).send({ msg: "Invalid lesson ID" });
      }
  
      // Convert stockToDecrement to a number if it's not already
      stockToDecrement = Number(stockToDecrement);
      if (isNaN(stockToDecrement) || stockToDecrement <= 0) {
          return res.status(400).send({ msg: "Invalid stock decrement value" });
      }
  
      try {
          const lesson = await database.collection('Products').findOne({ _id: new ObjectId(lessonId) });
  
          if (!lesson) {
              return res.status(404).send({ msg: "Lesson not found" });
          }
  
          console.log(`Current stock: ${lesson.stock}, Requested decrement: ${stockToDecrement}`);
  
          if (lesson.stock >= stockToDecrement) {
              const result = await database.collection('Products').updateOne(
                  { _id: new ObjectId(lessonId) },
                  { $inc: { stock: -stockToDecrement } }
              );
  
              if (result.modifiedCount === 1) {
                  res.send({ msg: "Lesson stock updated successfully" });
              } else {
                  res.status(400).send({ msg: "No changes made to the lesson stock" });
              }
          } else {
              res.status(400).send({ msg: "Not enough stock available for the lesson" });
          }
      } catch (error) {
          console.error('Error updating lesson:', error);
          res.status(500).send('Internal Server Error');
      }
  });
  
    // Start the server:
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log("App started on port: " + port);
    });
  })
  .catch((error) => {
    console.error('Failed to start the server:', error);
  });