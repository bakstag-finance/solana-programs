#!/bin/bash

# Step 1: Close all program buffers
echo "👾 Closing buffers 👾"
solana program close --buffers

# Step 2: Fetch the list of programs
output=$(solana program show --programs)

# Parse the output and skip the header (first line)
program_ids=($(echo "$output" | tail -n +2 | awk '{print $1}'))

# Step 3: Check if there are any programs, and close them one by one
if [ ${#program_ids[@]} -eq 0 ]; then
  echo "No programs found."
else
  echo "👾 Closing programs 👾"
  for program_id in "${program_ids[@]}"; do
    solana program close "$program_id" --bypass-warning
  done
fi
