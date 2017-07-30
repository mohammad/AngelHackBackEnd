var express = require('express');
var router = express.Router();
var models = require('../models.js');
var _ = require('underscore');
var Card = models.Card;
var User = models.User;

// API set up here
var Clarifai = require('clarifai');

const clarifai = new Clarifai.App({
     apiKey: process.env.CLARIFAI_KEY
});

//////////////////////////////// PUBLIC ROUTES ////////////////////////////////
// Users who are not logged in can see these routes

router.get('/', function(req, res, next) {
  res.json({test: 'test'});
});

router.post('/getUser', function(req, res, next) {
  var facebookId = req.body.facebookId;
  var name = req.body.name;

  User.findOne({facebookId: facebookId}, function(err, user) {
    if(!user) {
      var newUser = new User({
        facebookId: facebookId,
        name: name,
        // age: null,
        // location: null,
        // gender: null,
        myCards: [],
        stylePoints: 0,
        history: []
      });
      newUser.save(function(err) {
        if(err) {
          console.log('The user failed to save', err);
        }

      })
      res.json(newUser);
    }
    else {
      res.json(user);
    }
  });
});

router.get('/getTenCards/:userId', function(req, res, next) {
  // user --> user viewed cards && user posted cards
  // all cards --> take cards not in user cards
  // return random of those random cards
  var userId = req.params.userId

  User.findById(userId, function(err, user) {
    // did not error catch here
    if(user) {
      // should happen on newly registered user
      if(user.myCards.length === 0 && user.history.length === 0) {
        Card.find({}, function(err, cards) {
          var shuffledCards = _.shuffle(cards);
          var tenCards = shuffledCards.slice(0, 30);
          // shuffles cards and sends to front end
          res.json({cards: tenCards, stylePoints: user.stylePoints});
        });

      } else {
        // filters card array for just card with IDS
        Card.find({}, function(err, cards) {
          var cardIds = cards.map(function(card) {
            return card._id;
          });
          var userCards = user.myCards.map(function(card) {
            return card._id
          });
          var userSeenCards = user.history.map(function(card) {
            return card.card
          });
          // now find cards in cardsIds that are NOT in userCards AND userSeenCards
          var uniqueCardIds = cardIds.filter(function(cardId) {
            return (userCards.indexOf(cardId) === -1 && userSeenCards.indexOf(cardId) === -1);
          });
          // shuffles cards and sends to front end

          var uniqueCards = cards.filter(function(card) {
            return (uniqueCardIds.indexOf(card._id) !== -1)
          })

          var shuffledCards = _.shuffle(uniqueCards);
          var tenCards = shuffledCards.slice(0, 30);



          res.json({cards: tenCards, stylePoints: user.stylePoints})
        });
      }
    } else {
      res.json({success: false})
    }

  })

})

router.post('/vote', function(req, res, next) {
  var cardId = req.body.cardId;
  var userId = req.body.userId;
  var vote = req.body.vote;

  User.findById(userId, function(err, user) {
    if(err) {
      console.log('there was an error', err);
    }
    if(!user) {
      res.json({success: false})
    } else {
      // pushes user histoy to
      var voteObj = {
        card: cardId,
        dateVoted: new Date().toISOString(),
        correctness: null,
        myVote: vote
      }

      user.history.push(voteObj);
      Card.findById(cardId, function(err, card) {
        if(!card) {
          res.json({success: false});
        } else {
          card.views.push(userId);
          if(vote === 1) {
            card.votesA.push(userId);
          } else if(vote === 2) {
            card.votesB.push(userId);
          }
        }
        res.json({success: true, card: card});
        card.save();
      })
    }
    user.save();
  })
})

router.post('/queryImage', function(req, res, next) {
  var image = req.body.image;
  clarifai.models.predict('e0be3b9d6a454f0493ac3a30784001ff', req.body.image).then(
    function(response) {
      var items = response.outputs[0].data.concepts;
      var itemURLS = items.map(function(item) {
        if(item.value > 0.45) {
          // parse items
          var itemSearch = item.name.split('/').join('').split(' ').join('%20');
          var itemURL = `https://www.amazon.com/s/field-keywords=${itemSearch}`;
          return itemURL;
        }
      }).filter(function(item) {
        return item
      })
      res.json(itemURLS);
    },
    function(err) {
      console.error(err);
    }
  );
});

router.post('/getmyhistory', function(req, res, next){
  var id = req.body.id;
  User.findById(id).populate('history.card').exec()
  .then(user => {
    var tempArr = [];
    user.history.forEach(card => {
      if (card.myVote !== 0 && card.card.finalDecision !== 0){
        tempArr.push(card);
      }
    });
    res.json({cards: tempArray});
  })
  .catch(err => {
    console.log(err)
  })
})

router.post('/uploadcard', function(req, res, next) {
  // console.log("this is req.body in post/uploadcard", req.body)
  console.log(req.body.imageA);
  // predict the contents of an image by passing in a url
  clarifai.models.predict('e9576d86d2004ed1a38ba0cf39ecb4b1', req.body.imageA).then(
    function(response) {
      var sfwVal = response.outputs[0].data.concepts[0].value;
      if(sfwVal < 0.7) {
        res.json({success: false});
        return next();
      }
    },
    function(err) {
      console.error(err);
    }
  );
  clarifai.models.predict('e9576d86d2004ed1a38ba0cf39ecb4b1', req.body.imageB).then(
    function(response) {
      var sfwVal = response.outputs[0].data.concepts[0].value;
      if(sfwVal < 0.7) {
        res.json({success: false})
        return next();
      }
    },
    function(err) {
      console.error(err);
    }
  );

  console.log('does this execute');

  var newCard = new Card({
    author: req.body.userId,
    dateCreated: Date.now(),
    finalDecision: 0, // what the poster decided, 0 is undecided 1 is first choice, 2 is second choice
    imageA: req.body.imageA,
    imageB: req.body.imageB,
    votesA: [], // userIds
    votesB: [],  // userIDs
    views: [],
  });
  newCard.save(function(err, newCard){
    if(err){
      res.json({success: false});
    } else {
      User.findOne({_id: req.body.userId}, function(err, user){
        console.log('this is the new card', newCard);
        user.myCards.push(newCard._id);
        user.save(function(err, user){
          if(err){
            res.json({success: false});
          } else {
            res.json({success: true, card: newCard, user: user});
          }
        })
      })
    }
  })
})

router.get('/getcard/:id', function(req, res, next){
  var id = req.params.id;
  // console.log("this is req.params.match.id", id);
  Card.findOne({_id: id}, function(err, card){
    if(err){
      console.log("error getting card:", err);
      res.json({success: false});
    } else {
      res.json({card: card})
    }
  })
})

router.post('/postclosecard', function(req, res, next) {
  var id = req.body.cardId;
  var num = req.body.finalDecision;
  // console.log("id", id);
  // console.log("num", num);
  // console.log("req.body", req.body);
  // res.json({req: req.body});
  Card.findOne({_id: id}, function(err, card){
    if(err){
      res.json({success: false});
    } else {
      // console.log("card", card);
      if(card.finalDecision){
        console.log("final decision already made!");
        res.json({success: true});
      } else {
        card.finalDecision = num;
        card.save(function(err){
          if(err){
            console.log("error saving final decision");
            res.json({success: false});
          } else {
            console.log("this is updated card:", card);
            res.json({success: true})
          }
        })
      }
    }
  })
})

router.get('/getmycards/:id', function(req, res, next){
  var id = req.params.id;
  // console.log("params", req.params);
  // console.log("id", id);
  User.findById(id, function(err, user){
    if(err){
      console.log("error:", err);
    } else {
      console.log("user", user);
      arrayPromises = user.myCards.map((card) => {
        return Card.findById(card._id)
      })
      Promise.all(arrayPromises).then((results) => {
        // console.log("this is arrayPromises results", results);
        res.json({cards: results});
      })
    }
  })
})


  // .then((user) => {
  //   console.log("user", user);
  //   arrayPromises = user.myCards.map((cardId) => {
  //     return Card.findById(cardId)
  //   })
  //   Promise.all(arrayPromises).then((results) => {
  //     console.log("this is arrayPromises results", results);
  //     res.json({cards: cards})
    // })
  // })

  // User.findOne({_id: id}, function(err, user){
  //   if(err){
  //     console.log("error getting user.mycards:", err);
  //     res.json({success: false});
  //   } else {
  //     var returnArray = [];
  //     for(var i = 0; i < user.myCards; i++){
  //       if()
  //     }
  //   }
  // })
///////////////////////////// END OF PUBLIC ROUTES /////////////////////////////

router.use(function(req, res, next){
  if (!req.user) {
    res.redirect('/login');
  } else {
    return next();
  }
});

//////////////////////////////// PRIVATE ROUTES ////////////////////////////////
// Only logged in users can see these routes


///////////////////////////// END OF PRIVATE ROUTES /////////////////////////////

module.exports = router;
