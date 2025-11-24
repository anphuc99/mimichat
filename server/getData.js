import "dotenv/config";
import https from "https";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const SERVER_HOST = process.env.SERVER_HOST || "https://mimichat.io.vn";
const SERVER_API_KEY = process.env.SERVER_API_KEY;

// Ignore self-signed certificate errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

if (!SERVER_API_KEY) {
  console.error("Error: SERVER_API_KEY is not defined in environment variables");
  process.exit(1);
}

async function getData() {
  return new Promise((resolve, reject) => {
    const url = `${SERVER_HOST}/api/get-data?key=${encodeURIComponent(SERVER_API_KEY)}`;
    const tmpZipPath = path.join(process.cwd(), `temp-download-${Date.now()}.zip`);
    
    console.log("Fetching data from server...");
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch data: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      // Write directly to file stream instead of memory
      const fileStream = fs.createWriteStream(tmpZipPath);
      let downloadedBytes = 0;
      
      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        process.stdout.write(`\rDownloading: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
      });
      
      response.pipe(fileStream);
      
      fileStream.on("finish", () => {
        console.log(`\nDownload complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
        fileStream.close();
        
        try {
          console.log("Extracting files...");
          
          // Extract zip from file
          const zip = new AdmZip(tmpZipPath);
          const zipEntries = zip.getEntries();
          
          console.log(`Extracting ${zipEntries.length} files...`);
          
          // Extract to current directory
          const extractPath = path.join(process.cwd());
          zip.extractAllTo(extractPath, true);
          
          // Clean up temp file
          fs.unlinkSync(tmpZipPath);
          
          console.log("Data extracted successfully!");
          console.log(`Files saved to: ${path.join(extractPath, "data")}`);
          
          resolve();
        } catch (error) {
          // Clean up temp file on error
          if (fs.existsSync(tmpZipPath)) {
            fs.unlinkSync(tmpZipPath);
          }
          reject(error);
        }
      });
      
      fileStream.on("error", (error) => {
        if (fs.existsSync(tmpZipPath)) {
          fs.unlinkSync(tmpZipPath);
        }
        reject(error);
      });
      
      response.on("error", (error) => {
        if (fs.existsSync(tmpZipPath)) {
          fs.unlinkSync(tmpZipPath);
        }
        reject(error);
      });
    }).on("error", (error) => {
      reject(error);
    });
  });
}

// Run the tool
getData()
  .then(() => {
    console.log("\n✅ Success: Data fetched and extracted");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
