# Dorks Search Service

## Purpose
This service utilizes Google Custom Search API to perform advanced "dork" queries against a target domain. It helps in discovering exposed secrets, sensitive files, configuration leaks, and vulnerable endpoints.

## Dependencies
- Google Custom Search JSON API Key
- Custom Search Engine ID (CX)
- Shared CSS/JS from the main application shell

## Configuration
The service uses a pool of API keys defined in `module.js`.
The dork list is maintained in the `dorks` array within the class.

## API Endpoints
- `https://www.googleapis.com/customsearch/v1`

## Usage
1. Enter target domain in the global search bar.
2. Select "Dorks Search" from the service menu.
3. Click "START DORK SCAN".
