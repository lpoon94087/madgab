def split_flashcards(input_file, terms_file, definitions_file):
    """
    Split a flashcard file with 'term,definition' format into separate files
    
    Parameters:
    input_file (str): Path to input file containing 'term,definition' pairs
    terms_file (str): Path where terms will be saved
    definitions_file (str): Path where definitions will be saved
    """
    terms = []
    definitions = []
    
    # Read and split the input file
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            # Skip empty lines
            if line.strip():
                # Split on first comma
                term, definition = line.strip().split(',', 1)
                terms.append(term.strip())
                definitions.append(definition.strip())
    
    # Write terms to file
    with open(terms_file, 'w', encoding='utf-8') as f:
        for term in terms:
            f.write(term + '\n')
    
    # Write definitions to file
    with open(definitions_file, 'w', encoding='utf-8') as f:
        for definition in definitions:
            f.write(definition + '\n')
    
    return len(terms)  # Return number of pairs processed
