const showBtn = document.getElementById('showPeople');
const peopleSection = document.getElementById('peopleSection');
const chatBox = document.getElementById('chatBox');

showBtn.addEventListener('click', () => {
    const category = document.getElementById('category').value;

    if (!category) {
        alert('Please select a category');
        return;
    }

    peopleSection.classList.remove('hidden');
});

function openChat() {
    chatBox.classList.remove('hidden');
}
