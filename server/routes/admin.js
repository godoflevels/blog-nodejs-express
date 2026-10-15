const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const loginLimiter = require('../helpers/loginLimiter');

const adminLayout = '../views/layouts/admin';
const jwtSecret = process.env.JWT_SECRET;

// GET Admin - Check Login
const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}


// Only these in-site destinations may be requested through ?next=
const allowedNext = ['/modshub'];

// GET Admin - Login Page
router.get('/admin', (req, res, next) => {
    try {
      const locals = {
        title: "Admin",
        description: "Simple Blog created with NodeJs, Express & MongoDb."
      }
      const nextUrl = allowedNext.includes(req.query.next) ? req.query.next : '';
      res.render('admin/index', { locals, nextUrl, layout: adminLayout });
    } catch (error) {
      next(error);
    }
});

// POST Admin - Check Login
router.post('/admin', async (req, res, next) => {
    try {
      const { username, password } = req.body;

      if (loginLimiter.isBlocked(req.ip)) {
        return res.status(429).json({ message: "Too many failed attempts. Try again in 15 minutes." });
      }

      const user = await User.findOne({username});

      if (!user) {
        loginLimiter.recordFailure(req.ip);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password)

      if (!isPasswordValid) {
        loginLimiter.recordFailure(req.ip);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      loginLimiter.reset(req.ip);

      const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: '30d'});
      res.cookie('token', token, {
        httpOnly: true, 
        sameSite: 'strict', 
        maxAge: 10 * 24 * 60 * 60 * 1000, 
        secure: process.env.NODE_ENV === 'production',
      });

      const nextUrl = allowedNext.includes(req.body.next) ? req.body.next : '/dashboard';
      res.redirect(nextUrl)
    } catch (error) {
      next(error);
    }
});

// GET Admin - Dasboard
router.get('/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const locals = {
        title: "Dashboard",
        description: "Simple Blog created with NodeJs, Express & MongoDb."
      }
    const data = await Post.find();
    res.render('admin/dashboard', { locals, data, layout: adminLayout });
  } catch (error) {
    next(error);
  }
});

// GET Admin - Create new post
router.get('/add-post', authMiddleware, async (req, res, next) => {
  try {
    const locals = {
        title: "Add Post",
        description: "Simple Blog created with NodeJs, Express & MongoDb."
      }
    res.render('admin/add-post', { locals, layout: adminLayout });
  } catch (error) {
    next(error);
  }
});

// POST Admin - Create new post
router.post('/add-post', authMiddleware, async (req, res, next) => {
  try {
    const newPost = new Post({
      title: req.body.title,
      body: req.body.body
    });

    await Post.create(newPost);
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

// GET Admin - Edit post
router.get('/edit-post/:id', authMiddleware, async (req, res, next) => {
  try {
    const locals = {
        title: "Edit Post",
        description: "Simple Blog created with NodeJs, Express & MongoDb."
      }
    const data = await Post.findOne({ _id: req.params.id });

    res.render('admin/edit-post', { locals, data, layout: adminLayout })
  } catch (error) {
    next(error);
  }
});

// PUT Admin - Edit post
router.put('/edit-post/:id', authMiddleware, async (req, res, next) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, {
      title: req.body.title,
      body: req.body.body,
      updatedAt: Date.now()
    })

    res.redirect(`/edit-post/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});



// POST Admin - Check Login
// router.post('/admin', async (req, res) => {
//     try {
//       const { username, password } = req.body;






//       res.redirect('/admin');
//     } catch (error) {
//       console.log(error);
//     }
// });



// POST Admin - Register
// router.post('/register', async (req, res) => {
//     try {
//       const { username, password } = req.body;
//       const hashedPassword = await bcrypt.hash(password, 10);
//       try {
//         const user = await User.create({ username, password: hashedPassword });
//         res.status(201).json({ message: "User Created", user})
//       } catch (error) {
//         console.log(error);
//         if (error.code === 11000) {
//           return res.status(409).json({ message: "User already in use"});
//         } 
//         res.status(500).json({ message: "Internal server error"});
//       }
//     } catch (error) {
//       console.log(error);
//     }
// });

// DELETE / Admin - Delete Post
router.delete('/delete-post/:id', authMiddleware, async (req, res, next) => {
  try {
    await Post.deleteOne({ _id: req.params.id });
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

// GET / Admin Logout
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  // res.json({ message: 'Logout successful' });
  res.redirect('/');
});

module.exports = router;