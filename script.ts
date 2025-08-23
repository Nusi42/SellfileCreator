// Interfaces for JSON structure
interface Substat {
    ID: number;
    Value: number;
    IsFlat: boolean;
    Condition: string;
    NotAvailable: boolean;
}

interface Rule {
    Keep: boolean;
    Use: boolean;
    ArtifactSet: number[];
    ArtifactType: number[];
    Rank: number;
    Rarity: number;
    MainStatID: number;
    MainStatF: number;
    LVLForCheck: number;
    Substats: Substat[];
}

// Pagination state
let currentPage = 1;
const rowsPerPage = 10; // Adjust rows per page here
let paginatedData: Rule[] = [];

// Function to render table with pagination
function renderTable(data: Rule[], page: number): void {
    const tableBody = document.getElementById("tableBody")!;
    const headerRow = document.getElementById("headerRow")!;

    // Clear previous data
    tableBody.innerHTML = "";
    headerRow.innerHTML = "";

    // Dynamically generate table headers
    const keys = Object.keys(data[0]);
    keys.forEach(key => {
        const th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
    });

    const substatHeader = document.createElement("th");
    substatHeader.textContent = "Substats";
    headerRow.appendChild(substatHeader);

    // Paginate data
    const start = (page - 1) * rowsPerPage;
    const end = page * rowsPerPage;
    const pageData = data.slice(start, end);

    // Populate table rows
    pageData.forEach((rule) => {
        const row = document.createElement("tr");
        keys.forEach((key) => {
            const td = document.createElement("td");
            const value = (rule as any)[key];
            td.textContent = Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
            row.appendChild(td);
        });

        // Create a nested table for substats
        const substatsCell = document.createElement("td");
        const substatsTable = document.createElement("table");
        substatsTable.style.border = "1px solid #ddd";
        substatsTable.style.width = "100%";

        // Substats table headers
        const substatsHeaderRow = document.createElement("tr");
        ["ID", "Value", "IsFlat", "Condition", "NotAvailable"].forEach((header) => {
            const th = document.createElement("th");
            th.textContent = header;
            th.style.border = "1px solid #ddd";
            substatsHeaderRow.appendChild(th);
        });
        substatsTable.appendChild(substatsHeaderRow);

        // Substats table rows
        rule.Substats.forEach((substat) => {
            const substatRow = document.createElement("tr");
            Object.values(substat).forEach((value) => {
                const td = document.createElement("td");
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
function updatePaginationControls(totalRows: number): void {
    const paginationContainer = document.getElementById("paginationControls")!;
    paginationContainer.innerHTML = ""; // Clear old controls

    const totalPages = Math.ceil(totalRows / rowsPerPage);

    // Previous button
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Previous";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        currentPage--;
        renderTable(paginatedData, currentPage);
    };
    paginationContainer.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement("button");
        pageBtn.textContent = i.toString();
        pageBtn.disabled = i === currentPage;
        pageBtn.onclick = () => {
            currentPage = i;
            renderTable(paginatedData, currentPage);
        };
        paginationContainer.appendChild(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        currentPage++;
        renderTable(paginatedData, currentPage);
    };
    paginationContainer.appendChild(nextBtn);
}

// Event listener for file input
document.getElementById("fileInput")!.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files![0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const jsonData = JSON.parse(reader.result as string);
            if (jsonData.Rules && Array.isArray(jsonData.Rules)) {
                paginatedData = jsonData.Rules; // Save full dataset for pagination
                currentPage = 1; // Reset to the first page
                renderTable(paginatedData, currentPage);
            } else {
                alert("Invalid file format: Missing 'Rules' key.");
            }
        } catch (error) {
            alert("Error reading file: " + error.message);
        }
    };
    reader.readAsText(file);
});
