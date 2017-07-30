var mongoose = require('mongoose');
var connect = process.env.MONGODB_URI;
// var findOrCreate = require('mongoose-find-or-create');

mongoose.connect(connect);

var Schema = mongoose.Schema;

var userSchema = new Schema({
  facebookId: String,
  name: String,
  // age: Number,
  // location: String,
  // gender: String,
  myCards: [
    {
      card: {
        ref: 'Card',
        type: Schema.Types.ObjectId
      }
    }
  ],
  stylePoints: Number,
  history: [
    {
      card: {
          ref: 'Card',
          type: Schema.Types.ObjectId
      },
      dateVoted: Date,
      correctness: Boolean,
      myVote: Number,
    }
  ],
});

var cardSchema = new Schema({
  author: {   // populate userData relevent to card
    ref: 'User',
    type: Schema.Types.ObjectId,
  },
  dateCreated: Date,
  finalDecision: Number, // what the poster decided, 0 is undecided 1 is first choice, 2 is second choice
  imageA: String,
  imageB: String,
  votesA: Array, // userIds
  votesB: Array,  // userIDs
  views: Array,
});

// userSchema.plugin(findOrCreate);

var User = mongoose.model('User', userSchema);
var Card = mongoose.model('Card', cardSchema);

module.exports = {
  User: User,
  Card: Card
};
