const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

// Phase 8: collision-proof filenames shared by every upload route.
function makeStorage(destination) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destination);
    },

    filename: function (req, file, cb) {
      const uniqueName =
        Date.now() +
        "-" +
        crypto.randomBytes(8).toString("hex") +
        path.extname(file.originalname).toLowerCase();

      cb(null, uniqueName);
    }
  });
}

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed."), false);
  }
};

const mediaFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image or video files are allowed."), false);
  }
};

const imageUpload = multer({
  storage: makeStorage("uploads/"),
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const mediaUpload = multer({
  storage: makeStorage("uploads/"),
  fileFilter: mediaFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

module.exports = imageUpload;
module.exports.imageUpload = imageUpload;
module.exports.mediaUpload = mediaUpload;
