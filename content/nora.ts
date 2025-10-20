async function getBlobFromUrl(blobUrl: string) {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return blob
}

function blobToBase64(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function convertBlobUrlToBase64(blobUrl: string) {
  try {
    const blob = await getBlobFromUrl(blobUrl)
    const base64String = await blobToBase64(blob)
    return base64String
  } catch (error) {
    console.error('Error converting Blob URL to Base64:', error)
    throw error
  }
}

export function initNora() {
  convertBlobUrlToBase64
}
