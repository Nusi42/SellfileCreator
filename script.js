// Pagination state
var currentPage = 1;
var rowsPerPage = 10; // Adjust rows per page here
var paginatedData = [];
// Function to render table with pagination
function renderTable(data, page) {
    var tableBody = document.getElementById("tableBody");
    var headerRow = document.getElementById("headerRow");
    // Clear previous data
    tableBody.innerHTML = "";
    headerRow.innerHTML = "";
    // Dynamically generate table headers
    var keys = Object.keys(data[0]);
    keys.forEach(function (key) {
        var th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
    });
    var substatHeader = document.createElement("th");
    substatHeader.textContent = "Substats";
    headerRow.appendChild(substatHeader);
    // Paginate data
    var start = (page - 1) * rowsPerPage;
    var end = page * rowsPerPage;
    var pageData = data.slice(start, end);
    // Populate table rows
    pageData.forEach(function (rule) {
        var row = document.createElement("tr");
        keys.forEach(function (key) {
            var td = document.createElement("td");
            var value = rule[key];
            td.textContent = Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
            row.appendChild(td);
        });
        // Create a nested table for substats
        var substatsCell = document.createElement("td");
        var substatsTable = document.createElement("table");
        substatsTable.style.border = "1px solid #ddd";
        substatsTable.style.width = "100%";
        // Substats table headers
        var substatsHeaderRow = document.createElement("tr");
        ["ID", "Value", "IsFlat", "Condition", "NotAvailable"].forEach(function (header) {
            var th = document.createElement("th");
            th.textContent = header;
            th.style.border = "1px solid #ddd";
            substatsHeaderRow.appendChild(th);
        });
        substatsTable.appendChild(substatsHeaderRow);
        // Substats table rows
        rule.Substats.forEach(function (substat) {
            var substatRow = document.createElement("tr");
            Object.values(substat).forEach(function (value) {
                var td = document.createElement("td");
                td.textContent = String(value);
                td.style.border = "1px solid #ddd";
                substatRow.appendChild(td);
            });
            substatsTable.appendChild(substatRow);
        });
        substatsCell.appendChild(substatsTable);
        row.appendChild(substatsCell);
        tableBody.appendChild(row);
    });
    updatePaginationControls(data.length);
}
// Function to update pagination controls
function updatePaginationControls(totalRows) {
    var paginationContainer = document.getElementById("paginationControls");
    paginationContainer.innerHTML = ""; // Clear old controls
    var totalPages = Math.ceil(totalRows / rowsPerPage);
    // Previous button
    var prevBtn = document.createElement("button");
    prevBtn.textContent = "Previous";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = function () {
        currentPage--;
        renderTable(paginatedData, currentPage);
    };
    paginationContainer.appendChild(prevBtn);
    var _loop_1 = function (i) {
        var pageBtn = document.createElement("button");
        pageBtn.textContent = i.toString();
        pageBtn.disabled = i === currentPage;
        pageBtn.onclick = function () {
            currentPage = i;
            renderTable(paginatedData, currentPage);
        };
        paginationContainer.appendChild(pageBtn);
    };
    // Page numbers
    for (var i = 1; i <= totalPages; i++) {
        _loop_1(i);
    }
    // Next button
    var nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = function () {
        currentPage++;
        renderTable(paginatedData, currentPage);
    };
    paginationContainer.appendChild(nextBtn);
}
// Event listener for file input
document.getElementById("fileInput").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file)
        return;
    var reader = new FileReader();
    reader.onload = function () {
        try {
            var jsonData = JSON.parse(reader.result);
            if (jsonData.Rules && Array.isArray(jsonData.Rules)) {
                paginatedData = jsonData.Rules; // Save full dataset for pagination
                currentPage = 1; // Reset to the first page
                renderTable(paginatedData, currentPage);
            }
            else {
                alert("Invalid file format: Missing 'Rules' key.");
            }
        }
        catch (error) {
            alert("Error reading file: " + error.message);
        }
    };
    reader.readAsText(file);
});
