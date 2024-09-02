const RMP_RATING_COL_NAME = 'RMP Rating';

function ngrams(string, n = 3) {
    string = string.toLowerCase();
    string = string.replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric characters
    let ngramsArray = [];
    for (let i = 0; i <= string.length - n; i++) {
        ngramsArray.push(string.substring(i, i + n));
    }
    return ngramsArray;
}

function tanimotoCoefficient(name1, name2, n = 3) {
    let ngrams1 = new Set(ngrams(name1, n));
    let ngrams2 = new Set(ngrams(name2, n));
    
    let intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    let union = new Set([...ngrams1, ...ngrams2]);
    
    return union.size !== 0 ? intersection.size / union.size : 0;
}

function insertTeachersRatings(elements, iframe) {
    chrome.storage.local.get('teacher_data', (result) => {
        const teacher_data = result.teacher_data || {};

        let names = new Set();
        elements.forEach(element => {
            names.add(element.textContent);
        });

        let name_lookup = {};
        names.forEach(name => {
            let best_match = '';
            let highest_score = 0;

            for (let teacher_name in teacher_data) {
                let score = tanimotoCoefficient(name, teacher_name);
                if (score > highest_score) {
                    highest_score = score;
                    best_match = teacher_name;
                }
            }

            name_lookup[name] = {
                matchQuality: highest_score,
                data: best_match ? teacher_data[best_match] : undefined
            };
        });

        elements.forEach((element, index) => {
            let name = element.textContent;
            let tableId = `SSR_CLSRCH_MTG1$scroll$${index}`;
            let table = iframe.contentWindow.document.getElementById(tableId);

            if (table) {
                let ratingContent = document.createElement('div');
                ratingContent.style.fontWeight = 'bold';

                let rmpName = document.createElement('a');

                let teacher = name_lookup[name];
                let match_quality = teacher.matchQuality;

                if (match_quality == 0){
                    ratingContent.textContent = 'Unknown';
                    rmpName.textContent = 'Unknown';
                } else {
                    let data = teacher.data;
                    // Convert the avgRating to a float with one decimal place
                    data.avgRating = parseFloat(data.avgRating).toFixed(1);
                    let display_value = `${data.avgRating} (${data.numRatings})`;
                    ratingContent.textContent = display_value;

                    // Set the color based on the avgRating value
                    if (data.avgRating < 3) {
                        ratingContent.style.color = '#ed5a5a';
                    } else if (data.avgRating >= 3 && data.avgRating < 4) {
                        ratingContent.style.color = '#FFB504';
                    } else if (data.avgRating >= 4) {
                        ratingContent.style.color = '#28cf1f';
                    };

                    // Add hyperlink for professor name
                    rmpName.textContent = `${data.firstName} ${data.lastName}`;
                    rmpName.href = `https://www.ratemyprofessors.com/professor/${data.legacyId}`;
                    rmpName.target = '_blank';

                    // Add the warning icon if match quality is less than 0.7
                    if (match_quality < 0.8) {
                        rmpName.textContent = rmpName.textContent + '❓';
                    }
                }

                // Assuming that the table has a header row and a value row, add a new column with the RMP Rating
                let headerRow = table.rows[0];
                let valueRow = table.rows[1];

                if (headerRow && valueRow) {
                    // Add column headers
                    const colNames = [RMP_RATING_COL_NAME, 'RMP Name'];
                    for (let colName of colNames) {
                        let newHeaderCell = document.createElement('th');
                        newHeaderCell.scope = 'col';
                        newHeaderCell.classList.add('gh-table-heading');
                        newHeaderCell.textContent = colName;
                        newHeaderCell.style.color = 'white';
                        newHeaderCell.style.fontWeight = 'bold';
                        newHeaderCell.style.whiteSpace = 'normal'; // Prevent wrapping in header if needed
                        headerRow.appendChild(newHeaderCell);
                    }
                
                    // Add the rating value and professor name in the new columns
                    const colVals = [ratingContent, rmpName];
                    for (let colVal of colVals) {
                        let newValueCell = document.createElement('td');
                        newValueCell.appendChild(colVal);
                        newValueCell.style.whiteSpace = 'nowrap'; // Allow text to wrap naturally
                        newValueCell.style.zIndex = '1'; // Ensure the link is always on top and clickable
                        valueRow.appendChild(newValueCell);
                    }
                }
            }
        });
    });
};

let lastPageIsClassSearch = false;

function observePage() {
    console.log('Observing page')
    // Check if the observer is already running to avoid duplicate observers
    const observer = new MutationObserver((mutations, observer) => {
        var iframe = document.getElementById("ptifrmtgtframe");
        if (!iframe){
            return;
        }

        // Check if we're on the right page
        let elements = iframe.contentWindow.document.querySelectorAll('[id^="MTG_INSTR$"]');
        let table = iframe.contentWindow.document.getElementById('SSR_CLSRCH_MTG1$scroll$0');
        if (!table){
            lastPageIsClassSearch = false;
            return;
        };

        const onCorrectPage = elements != null;
        if (onCorrectPage && lastPageIsClassSearch === false) {
            lastPageIsClassSearch = true;
            insertTeachersRatings(elements, iframe);
        }
    });

    // Start observing the entire document for changes
    observer.observe(document, {
        childList: true,
        subtree: true,
    });
}

// Ensure the document is fully loaded before starting the observer
if (document.readyState === "complete" || document.readyState === "interactive") {
    console.log('running observePage()')
    observePage();
} else {
    console.log('running event listener')
    window.addEventListener("DOMContentLoaded", observePage);
}
