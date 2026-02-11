
/**
 * Triggers a download for a given URL.
 * Attempts to fetch as blob first to support reliable naming and bypass some CORS issues.
 * @param {string} url - The URL of the media
 * @param {string} filename - Desired filename
 */
export const downloadMedia = async (url, filename = 'download') => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error("Download failed, trying direct link:", error);
        // Fallback to direct link
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
